// Lector de planillas de «Pasar mis planillas».
// a) vendor/: SheetJS 0.20.3 «mini» tal cual viene del CDN oficial (cdn.sheetjs.com, nunca de npm:
//    la 0.18.5 de npm tiene fallas conocidas), con su licencia Apache-2.0 en LICENSES.txt, su fila
//    en vendor/README.md (con el sha256 para compararlo con el del CDN) y sin eval ni new Function
//    (la CSP de la app no deja). Sin planillas de verdad en el repo: las pruebas las arman en el momento.
// b) app/core/planilla.js en la app (con su CSP), con planillas inventadas que arma la prueba con el
//    mismo SheetJS: un .xlsx con varias hojas (una oculta), celdas combinadas, porcentajes, fechas
//    e hipervínculos, un .ods, un .xlsm y dos .csv (UTF-8 con «,» y Windows-1252 con «;»). Controla
//    las filas y el texto que iría a la IA: sin el nombre de la hoja, del archivo ni de los alumnos,
//    sin mails, teléfonos, documentos ni links, sin las filas de datos personales o de salud, y con
//    «60-65-70-75» y «12-10-8-6» enteros. También los links de video por fila, los topes, los
//    archivos que no se pueden leer, adivinarAlumno, la última semana y que SheetJS se carga recién
//    al leer una planilla (y se puede reintentar si falló).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { newPage, wait } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const XLSX_JS = 'vendor/xlsx-0.20.3.mini.min.js';

export default async function ({ base, t }){
  // ---- a) SheetJS en vendor/ ----
  {
    const buf = fs.readFileSync(path.join(ROOT, XLSX_JS)), js = buf.toString('utf8');
    t.ok(js.startsWith('/*! xlsx.js (C) 2013-present SheetJS -- http://sheetjs.com */'), 'vendor: SheetJS con su aviso del principio, sin cambios');
    t.ok(js.includes('e.version="0.20.3"'), 'vendor: SheetJS es la 0.20.3');
    t.ok(!/\bnew Function\b|\bFunction\(|\beval\(/.test(js), 'vendor: SheetJS sin eval ni new Function (la CSP no tiene unsafe-eval)');
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const readme = read('vendor/README.md');
    t.has(readme, '| `xlsx-0.20.3.mini.min.js` |', 'vendor/README.md: la fila de SheetJS');
    t.has(readme, sha, 'vendor/README.md: el sha256 del archivo (igual al del CDN)');
    t.has(readme, 'nunca de npm', 'vendor/README.md: SheetJS se baja del CDN oficial');
    const lic = read('vendor/LICENSES.txt');
    t.has(lic, '  - xlsx (SheetJS Community Edition) 0.20.3  →  vendor/xlsx-0.20.3.mini.min.js', 'LICENSES.txt: SheetJS en el índice');
    t.has(lic, 'xlsx (SheetJS Community Edition) 0.20.3  (vendor/xlsx-0.20.3.mini.min.js)', 'LICENSES.txt: la sección de SheetJS 0.20.3');
    const sec = lic.slice(lic.indexOf('xlsx (SheetJS Community Edition) 0.20.3  (vendor/'));
    t.has(sec, 'Apache License\n                           Version 2.0, January 2004', 'LICENSES.txt: el texto completo de la Apache-2.0');
    t.has(sec, 'Copyright (C) 2012-present   SheetJS LLC', 'LICENSES.txt: el copyright de SheetJS');
    // Nada de SheetJS de npm (ni de otra fuente) en el proyecto.
    const pkg = JSON.parse(read('package.json')), deps = Object.assign({}, pkg.dependencies, pkg.devDependencies);
    t.ok(!('xlsx' in deps), 'package.json: sin el xlsx de npm');
    t.eq(fs.readdirSync(path.join(ROOT, 'vendor')).filter(f => /^xlsx/i.test(f)), ['xlsx-0.20.3.mini.min.js'], 'vendor: una sola copia de SheetJS');
    // Sin planillas de verdad en el repo (ni en las pruebas): se arman en el momento.
    const planillas = [];
    const recorrer = d => { for (const f of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      if (f.isDirectory()) { if (!/^(node_modules|\.git|www|android|ios)$/.test(f.name)) recorrer(path.join(d, f.name)); }
      else if (/\.(xlsx|xlsm|xls|xlsb|ods|numbers|csv)$/i.test(f.name)) planillas.push(path.join(d, f.name));
    } };
    recorrer('.');
    t.eq(planillas, [], 'sin planillas (.xlsx, .ods, .csv…) guardadas en el repo');
    t.ok(!read('sw.js').includes('xlsx'), 'sw.js: SheetJS no se guarda al instalar (se pide recién al leer una planilla)');
  }

  // ---- b) Leer y limpiar, en la app ----
  {
    const { p, errs, close } = await newPage({});
    const pedidos = [], csp = [];
    p.on('request', r => { if (/vendor\/xlsx/.test(r.url())) pedidos.push(r.url()); });
    p.on('console', m => { if (m.type() === 'error' && /Content Security Policy|unsafe-eval/i.test(m.text())) csp.push(m.text()); });
    await p.goto(base + '/app/'); await wait(800);
    t.eq(pedidos, [], 'al abrir la app no se pide SheetJS');

    // Sin internet la primera vez: avisa y se puede volver a probar.
    await p.route(/vendor\/xlsx/, r => r.abort());
    const sinLector = await p.evaluate(async () => {
      const m = await import('/app/core/planilla.js');
      const r = await m.leerArchivos([new File([new Uint8Array([0x50, 0x4B, 3, 4, 0, 0])], 'a.xlsx')]);
      return { error: r[0].error, xlsx: !!window.XLSX };
    });
    t.eq(sinLector, { error: 'sin_lector', xlsx: false }, 'sin SheetJS (no cargó): error «sin_lector»');
    await p.unroute(/vendor\/xlsx/);

    const r = await p.evaluate(async () => {
      const m = await import('/app/core/planilla.js');
      const X = await m.cargarXLSX(), mismo = X === await m.cargarXLSX();
      const archivo = (wb, nombre, bookType) => new File([X.write(wb, { type: 'array', bookType: bookType || 'xlsx' })], nombre);
      const libro = hojas => { const wb = X.utils.book_new(); hojas.forEach(([n, aoa]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), n)); return wb; };

      // «Alumnos 2026.xlsx»: una hoja por alumno, más Pagos, una oculta y una vacía.
      const juan = X.utils.aoa_to_sheet([
        ['Rutina de Juan Pérez'],
        ['Nombre: Juan Pérez'],
        ['Mail', 'juan.perez@correo.test'],
        ['Teléfono', '11 4567-8901'],
        ['Lesiones', 'Rodilla derecha'],
        [],
        ['Día', 'Ejercicio', 'Series', 'Reps', 'Carga', 'Descanso', 'Video', 'Notas'],
        ['Día 1', 'Press de banca plano (barra)', 4, '8-10', 0.75, "2'", 'Ver video', 'Avisarle a Martina: 15 4567 8901'],
        ['', 'Remo Pendlay', 3, '12-10-8-6', '60-65-70-75', '90"', 'https://youtu.be/abcdefghijk', 'DNI 30.123.456'],
        ['', 'Sentadilla libre', 5, '5', '5x5@100kg', "3'", 'drive.google.com/file/d/xyz', 'juan.perez@correo.test'],
        [],
        ['Fecha de control', 45000],
      ]);
      juan.E8.z = '0%';
      juan.B12.z = 'm/d/yy';
      juan.G8.l = { Target: 'https://www.youtube.com/watch?v=abcdefghijk' };
      juan['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 7, c: 0 }, e: { r: 9, c: 0 } }];
      const wb1 = X.utils.book_new();
      X.utils.book_append_sheet(wb1, juan, 'Juan Pérez');
      X.utils.book_append_sheet(wb1, X.utils.aoa_to_sheet([['Ejercicio', 'Series', 'Reps'], ['Hip thrust', 4, 10], ['RDL', 3, 8]]), 'Martina');
      X.utils.book_append_sheet(wb1, X.utils.aoa_to_sheet([['Mes', 'Monto'], ['Octubre', 20000]]), 'Pagos');
      X.utils.book_append_sheet(wb1, X.utils.aoa_to_sheet([['Ejercicio', 'Series'], ['Curl', 3]]), 'Viejo');
      X.utils.book_append_sheet(wb1, X.utils.aoa_to_sheet([['']]), 'Vacía');
      wb1.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 0 }, { Hidden: 0 }, { Hidden: 1 }, { Hidden: 0 }] };

      // «Rutina Sofía Ramírez.xlsx»: un archivo por alumna, con una hoja por semana.
      const semanas = [1, 2, 3, 4].map(n => ['Semana ' + n, [['Ejercicio', 'Series', 'Reps'], ['Sentadilla libre', 4, String(12 - n)], n === 4 ? ['Sofía Ramírez: subir la carga'] : ['Plancha', 3, "30''"]]]);

      // .csv UTF-8 (con su marca, comas entre comillas, comillas dobles y un salto de línea adentro)
      // y otro como lo guarda Excel en castellano: Windows-1252 con «;» y coma decimal.
      const utf8 = '\ufeffEjercicio,Series,Reps\r\nPress de banca,4,8-10\r\n"Remo, con barra",3,12\r\nSentadilla búlgara,3,"10 ""por pierna"""\r\n\r\nNotas,"Línea 1\nLínea 2"\r\nLucas: subir carga\r\n';
      const win = 'Ejercicio;Series;Reps;Carga\r\nPress inclinado;4;8-10;62,5\r\nExtensión de cuádriceps;3;12-10-8-6;60-65-70-75\r\n';
      const latin1 = s => Uint8Array.from(s, ch => ch.charCodeAt(0));

      let ods = null;
      try { ods = archivo(libro([['Rutina', [['Ejercicio', 'Series'], ['Dominadas', 4], ['Fondos', 3]]]]), 'Libre.ods', 'ods'); } catch (e) { ods = String(e && e.message); }

      const leidos = await m.leerArchivos([
        archivo(wb1, 'Alumnos 2026.xlsx'),
        archivo(libro(semanas), 'Rutina Sofía Ramírez.xlsx'),
        new File([new TextEncoder().encode(utf8)], 'Plan Lucas.csv'),
        new File([latin1(win)], 'Rutina Excel.csv'),
        typeof ods === 'string' ? new File([''], 'Libre.ods') : ods,
        archivo(libro([['Hoja1', [['Ejercicio', 'Series'], ['Peso muerto', 3]]]]), 'Copia.xlsm'),
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'grande.xlsx'),
        new File([new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])], 'viejo.xls'),
        new File([new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, ...Array.from('EncryptionInfo').flatMap(ch => [ch.charCodeAt(0), 0])])], 'clave.xlsx'),
        new File([new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1, 0, 0, ...Array.from('Workbook').flatMap(ch => [ch.charCodeAt(0), 0])])], 'renombrado.xlsx'),
        new File(['hola'], 'notas.txt'),
        new File(['<html><body>Iniciá sesión</body></html>'], 'trucha.xlsx'),
        new File([new Uint8Array([0x50, 0x4B, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8])], 'rota.xlsx'),
      ]);
      const [a1, a2, c1, c2, o1, x1] = leidos;
      const nombres = ['Martina López', 'Juan Gómez'];
      const textos = {
        juan: m.textoHoja(a1.hojas[0], { archivo: a1.archivo, nombres }),
        martina: m.textoHoja(a1.hojas[1], { archivo: a1.archivo, nombres }),
        sofia: m.textoHoja(a2.hojas[3], { archivo: a2.archivo, nombres }),
        lucas: m.textoHoja(c1.hojas[0], { archivo: c1.archivo, nombres }),
        win: m.textoHoja(c2.hojas[0], { archivo: c2.archivo, nombres }),
      };

      // Topes: 450 filas de 45 columnas (con una celda larga) y 65 hojas en total.
      const ancha = Array.from({ length: 450 }, (_, r) => Array.from({ length: 45 }, (_, c) => (r === 3 && c === 1) ? 'x'.repeat(300) : 'f' + r + 'c' + c + ' ' + 'texto'.repeat(4)));
      const muchas = Array.from({ length: 65 }, (_, i) => ['H' + i, [['Ejercicio', 'Series'], ['Curl', 3]]]);
      const [g1, g2, g3] = await m.leerArchivos([archivo(libro([['Larga', ancha]]), 'Larga.xlsx'), archivo(libro(muchas), 'Muchas.xlsx'), new File(['a,b\n1,2\n'], 'Otra.csv')]);
      const larga = m.textoHoja(g1.hojas[0], { archivo: g1.archivo });
      // Más formas de datos personales (sin SheetJS: la hoja a mano).
      const extra = m.textoHoja({ nombre: 'Hoja1', filas: [
        { n: 1, celdas: ['Teléfono de contacto', '351 456 7890'] },
        { n: 2, celdas: ['Lesiones previas: hombro'] },
        { n: 3, celdas: ['Altura del banco: 3', 'Press inclinado', '4', '10'] },
        { n: 4, celdas: ['Objetivo', 'Hipertrofia', 'Edad', '34'] },
        { n: 5, celdas: ['Nombre', 'Series', 'Reps'] },
        { n: 6, celdas: ['Press de banca plano (barra)', '4', '8-10'] },
        { n: 8, celdas: ['Nombre', 'Apellido', 'Plan'] },
        { n: 9, celdas: ['Pedro', 'Gómez', 'Mensual'] },
        { n: 10, celdas: ['Ana', 'Ruiz', 'Trimestral'] },
        { n: 12, celdas: ['Ejercicio', 'Notas'] },
        { n: 13, celdas: ['Remo con barra', 'mirá instagram.com/juan.perez'] },
      ] });

      const clientes = [{ id: 'a1', full_name: 'Juan Pérez' }, { id: 'a2', full_name: 'Juan Gómez' }, { id: 'a3', full_name: 'Martina López' }, { id: 'a4', full_name: 'Sofía Ramírez' }];
      const adivinar = [['Juan Pérez', 'Alumnos 2026.xlsx'], ['Juan', 'Alumnos 2026.xlsx'], ['juan p.', 'Alumnos.xlsx'], ['MARTINA', 'Alumnos.xlsx'],
        ['Semana 4', 'Rutina Sofía Ramírez.xlsx'], ['Hoja1', 'Plan.xlsx'], ['Pecho', 'Alumnos.xlsx'], ['Carlos', 'Planillas.xlsx'], ['Juan', 'Juan Gómez.xlsx']]
        .map(([h, a]) => m.adivinarAlumno(h, a, clientes));

      return {
        mismo, ods: typeof ods === 'string' ? ods : '',
        a1, a2, c1, c2, o1, x1, extra, errores: leidos.slice(6).map(x => [x.archivo, x.error || '', x.hojas.length]), textos,
        larga: { filas: g1.hojas[0].filas.length, cortada: g1.hojas[0].cortada, columnas: Math.max(...g1.hojas[0].filas.map(f => f.celdas.length)),
          largo: larga.texto.length, cortadaTexto: larga.cortada, celdaMax: Math.max(...larga.texto.split('\n').flatMap(l => l.split('|').map(c => c.length))) },
        muchas: [g2.hojas.length, g2.sobran || 0, g3.hojas.length, g3.sobran || 0],
        adivinar,
        tildadas: [m.tildadas(a1.hojas), m.tildadas(a2.hojas)], ultima: [m.ultimaSemana(a1.hojas), m.ultimaSemana(a2.hojas)],
        parece: a1.hojas.map(m.pareceRutina),
        limpiar: ['60-65-70-75', '12-10-8-6', '4x8@70.5kg', '1000 800 600 400', '15-03-2026', '+54 9 351 456-7890', '(0351) 456-7890', 'CUIT 20-30123456-7', 'Su DNI es 30.123.456', 'Tel 1145678901', 'mail: a.b@c.com.ar']
          .map(s => m.limpiar(s)),
        videos: ['javascript:alert(1)', 'http://youtube.com/watch?v=x', 'https://evil.test/youtube.com', 'www.instagram.com/p/abc/', 'https://u:p@m.youtube.com/shorts/x',
          'instagram.com/juan.perez', 'https://www.youtube.com/@canal', 'https://youtube.com.evil.test/watch?v=x'].map(m.linkVideo),
      };
    });

    t.ok(r.mismo, 'cargarXLSX: una sola vez');
    t.eq(pedidos.length, 2, 'SheetJS se pidió al leer la primera planilla (la vez que falló y la que anduvo), una sola vez más');
    t.eq(r.ods, '', 'SheetJS mini escribe .ods (para la prueba)');

    // «Alumnos 2026.xlsx»
    t.eq(r.a1.error, undefined, 'xlsx: se leyó');
    t.eq(r.a1.hojas.map(h => [h.nombre, h.oculta, h.filas.length]), [['Juan Pérez', false, 10], ['Martina', false, 3], ['Pagos', false, 2], ['Viejo', true, 2], ['Vacía', false, 0]],
      'xlsx: las hojas, con la oculta marcada y la vacía sin filas');
    const fj = r.a1.hojas[0].filas;
    t.eq(fj.map(f => f.n), [1, 2, 3, 4, 5, 7, 8, 9, 10, 12], 'xlsx: cada fila con su número en la planilla (sin las vacías)');
    t.eq(fj[0].celdas, ['Rutina de Juan Pérez'], 'xlsx: una celda combinada a lo ancho no se repite');
    t.eq(fj[6].celdas, ['Día 1', 'Press de banca plano (barra)', '4', '8-10', '75%', "2'", 'Ver video', 'Avisarle a Martina: 15 4567 8901'], 'xlsx: el texto como se ve (75 %)');
    t.eq([fj[7].celdas[0], fj[8].celdas[0]], ['Día 1', 'Día 1'], 'xlsx: una celda combinada a lo alto vale para cada fila');
    t.eq(fj[9].celdas, ['Fecha de control', '15/03/2023'], 'xlsx: la fecha corta como acá (día/mes/año)');
    t.eq(r.a1.hojas[0].links, { 8: 'https://www.youtube.com/watch?v=abcdefghijk', 9: 'https://youtu.be/abcdefghijk' }, 'xlsx: el video de cada fila (hipervínculo o escrito), sin otros links');
    t.eq(r.textos.juan.texto, [
      '1|Rutina de [alumno]',
      '7|Día|Ejercicio|Series|Reps|Carga|Descanso|Video|Notas',
      "8|Día 1|Press de banca plano (barra)|4|8-10|75%|2'|Ver video|Avisarle a [alumno]: [tel]",
      '9|Día 1|Remo Pendlay|3|12-10-8-6|60-65-70-75|90"|[video]',
      "10|Día 1|Sentadilla libre|5|5|5x5@100kg|3'|[link]|[mail]",
      '12|Fecha de control|15/03/2023',
    ].join('\n'), 'texto para la IA: filas numeradas, sin datos personales ni de salud');
    t.eq([r.textos.juan.filas, r.textos.juan.cortada, r.textos.juan.sacadas], [6, false, 5], 'texto: cuántas filas van y a cuántas se les sacaron datos');
    t.eq(r.textos.martina.texto, '1|Ejercicio|Series|Reps\n2|Hip thrust|4|10\n3|RDL|3|8', 'texto: los nombres de los ejercicios no se tocan');

    // «Rutina Sofía Ramírez.xlsx»: el nombre del archivo también se tapa.
    t.eq(r.a2.hojas.map(h => h.nombre), ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'], 'semanas: las cuatro hojas');
    t.eq(r.textos.sofia.texto, '1|Ejercicio|Series|Reps\n2|Sentadilla libre|4|8\n3|[alumno]: subir la carga', 'texto: el nombre del archivo pasa a [alumno]');

    // .csv
    t.eq(r.c1.hojas.map(h => [h.nombre, h.oculta]), [['Plan Lucas', false]], 'csv: una hoja con el nombre del archivo');
    t.eq(r.c1.hojas[0].filas.map(f => [f.n, f.celdas]), [[1, ['Ejercicio', 'Series', 'Reps']], [2, ['Press de banca', '4', '8-10']], [3, ['Remo, con barra', '3', '12']],
      [4, ['Sentadilla búlgara', '3', '10 "por pierna"']], [6, ['Notas', 'Línea 1 Línea 2']], [7, ['Lucas: subir carga']]], 'csv UTF-8: comillas, comas y saltos de línea adentro, tildes');
    t.has(r.textos.lucas.texto, '7|[alumno]: subir carga', 'csv: el nombre del archivo pasa a [alumno]');
    t.eq(r.c2.hojas[0].filas.map(f => f.celdas), [['Ejercicio', 'Series', 'Reps', 'Carga'], ['Press inclinado', '4', '8-10', '62,5'], ['Extensión de cuádriceps', '3', '12-10-8-6', '60-65-70-75']],
      'csv de Excel en castellano: Windows-1252 con «;» y coma decimal');
    t.has(r.textos.win.texto, '3|Extensión de cuádriceps|3|12-10-8-6|60-65-70-75', 'csv: la progresión y las repeticiones quedan enteras');

    // .ods y .xlsm
    t.eq(r.o1.error, undefined, 'ods: se leyó');
    t.eq((r.o1.hojas[0] || {}).filas, [{ n: 1, celdas: ['Ejercicio', 'Series'] }, { n: 2, celdas: ['Dominadas', '4'] }, { n: 3, celdas: ['Fondos', '3'] }], 'ods: las filas');
    t.eq(r.x1.hojas.map(h => h.filas.length), [2], 'xlsm: se lee como un xlsx');

    // Lo que no se puede leer.
    t.eq(r.errores, [['grande.xlsx', 'grande', 0], ['viejo.xls', 'xls', 0], ['clave.xlsx', 'clave', 0], ['renombrado.xlsx', 'xls', 0], ['notas.txt', 'formato', 0], ['trucha.xlsx', 'no_se_pudo', 0], ['rota.xlsx', 'no_se_pudo', 0]],
      'archivos que no se leen: más de 5 MB, .xls viejo, con contraseña, un .xls con otro nombre, otro formato, una página en vez de un Excel, dañado');

    // Nada personal en ningún texto para la IA.
    const todo = Object.values(r.textos).map(x => x.texto).join('\n');
    for (const [re, que] of [[/juan|p[eé]rez|martina|l[oó]pez|sof[ií]a|ram[ií]rez|lucas|alumnos 2026/i, 'nombres de hojas, archivos o alumnos'], [/@correo|\.test/i, 'mails'],
      [/4567|8901/, 'teléfonos'], [/30\.123\.456/, 'documentos'], [/youtu|instagram|drive\.google|https?:/i, 'links'], [/rodilla|lesiones/i, 'salud']])
      t.ok(!re.test(todo), 'texto para la IA sin ' + que + ': ' + (todo.match(re) || [''])[0]);
    t.ok(todo.includes('60-65-70-75') && todo.includes('12-10-8-6'), 'texto: «60-65-70-75» y «12-10-8-6» quedan');

    // Limpieza suelta y links de video.
    t.eq(r.limpiar, ['60-65-70-75', '12-10-8-6', '4x8@70.5kg', '1000 800 600 400', '15-03-2026', '[tel]', '[tel]', 'CUIT [doc]', 'Su DNI es [doc]', 'Tel [tel]', 'mail: [mail]'], 'limpiar: cargas, fechas, teléfonos, CUIT, DNI y mails');
    t.eq(r.videos, [null, 'https://youtube.com/watch?v=x', null, 'https://www.instagram.com/p/abc/', 'https://m.youtube.com/shorts/x', null, null, null],
      'linkVideo: solo videos de YouTube e Instagram (no perfiles), siempre https y sin usuario');
    t.eq(r.extra.texto, ['3|Altura del banco: 3|Press inclinado|4|10', '4|Objetivo|Hipertrofia', '5|Nombre|Series|Reps', '6|Press de banca plano (barra)|4|8-10',
      '9|||Mensual', '10|||Trimestral', '12|Ejercicio|Notas', '13|Remo con barra|mirá [link]'].join('\n'),
      'datos personales: «Teléfono de contacto», «Lesiones previas: …», «Edad» en el medio y una tabla de nombres; «Nombre» de los ejercicios y la altura del banco quedan');
    t.eq(r.extra.sacadas, 6, 'datos personales: cuántas filas se tocaron');

    // Topes.
    t.eq([r.larga.filas, r.larga.cortada, r.larga.columnas], [400, true, 40], 'topes: 400 filas con texto y 40 columnas por hoja');
    t.ok(r.larga.largo <= 30000 && r.larga.cortadaTexto, 'topes: el texto de una hoja hasta 30.000 caracteres (' + r.larga.largo + ')');
    t.ok(r.larga.celdaMax <= 120, 'topes: hasta 120 caracteres por celda (' + r.larga.celdaMax + ')');
    t.eq(r.muchas, [59, 6, 0, 1], 'topes: 60 hojas en total entre todos los archivos (la de «Larga» y 59 de «Muchas»; las que sobran se cuentan)');

    // Para elegir hojas y alumnos.
    t.eq(r.adivinar, ['a1', null, 'a1', 'a3', 'a4', null, null, null, 'a2'], 'adivinarAlumno: por la hoja o el archivo, sin adivinar si no está claro');
    t.eq(r.parece, [true, true, false, false, false], 'pareceRutina: no Pagos, no la oculta, no la vacía');
    t.eq(r.tildadas, [[true, true, false, false, false], [false, false, false, true]], 'tildadas: las rutinas y, de las semanas, solo la última');
    t.eq(r.ultima, [-1, 3], 'ultimaSemana');

    t.eq(csp, [], 'SheetJS anda con la CSP de la app');
    t.eq(errs, [], 'errores de la página');
    await close();
  }
}

// Lector de planillas de «Pasar mis planillas».
// a) vendor/: SheetJS 0.20.3 «mini» tal cual viene del CDN oficial (cdn.sheetjs.com, nunca de npm:
//    la 0.18.5 de npm tiene fallas conocidas), con su licencia Apache-2.0 en LICENSES.txt, su fila
//    en vendor/README.md (con el sha256 para compararlo con el del CDN) y sin eval ni new Function
//    (la CSP de la app no deja). Sin planillas de verdad en el repo: las pruebas las arman en el momento.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

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
  }
}

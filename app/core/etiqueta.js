// Lectura de la tabla nutricional desde una foto del paquete (Crear alimento → foto de la
// tabla). El texto lo reconoce Tesseract dentro del celular (vendor/tesseract/, sin internet
// y sin mandar la foto a ningún lado); acá se interpreta y se pasa a valores cada 100 g/ml.
//
// El reconocimiento se equivoca de maneras típicas: la "g" sale como "9", "y" o "q" ("18g" →
// "189"), la "O" en lugar del cero, filas partidas o columnas corridas. Por eso de cada número
// se prueban las lecturas posibles y se elige la combinación que cierra: las calorías con
// proteínas, carbohidratos y grasas (4/4/9) y, si la tabla trae las dos columnas, "cada 100 g"
// con "por porción". Lo que no cierra se devuelve igual pero marcado para que el cliente lo revise.

const NRM = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Renglones que no son de la tabla (ingredientes, la aclaración de la dieta de 2000 kcal…).
const SKIP_LINE = /dieta de|valores diarios|ingredientes|\bingr\b|ley 25630|mg\/kg|pueden ser mayores|necesidades energ/;
const ROWS = {
  k: /valor\s*energ\w*|energ[e]?tic\w*|\benerg\w*/g,
  c: /carbohid\w*|arbohid\w*|hidratos\s*de\s*carbono/g,
  p: /prot[e3][a-z]{1,5}s?\b|rote[i1l]n\w*/g,
  f: /grasas?\s*tot\w*|rasas\s*tot\w*|\bsas\s*tot\w*|lipidos\s*tot\w*/g,
};
// Otras filas: cortan el tramo de la fila anterior.
const STOP = /azucar\w*|zucar\w*|lactosa|saturad\w*|\btrans\b|fibra\w*|\bsodio\b|\bodio\b|calcio|colesterol|polialcohol\w*|vitamina\w*|hierro|monoinsat\w*|poliinsat\w*/g;

// "O0g", "Og", "1OO", "O,5" → ceros; "!g" / "lg" → "1g".
function fixZeros(s){
  s = s.replace(/(^|[\s|(:;=\/\-])[!|il](?=\s?g\b)/g, "$11");
  return s.replace(/(^|[\s|(:;=\/\-])[oO](?=[\s|)\/0-9gyq9]|[.,]\d|$)/g, "$10").replace(/\d[oO]+/g, m => m.replace(/[oO]/g, "0")).replace(/[oO](?=\d)/g, "0");
}

// kcal mal leído ("keal", "kcai", "koal") sigue siendo kcal.
const KCAL = /^(k[ceo]a[l1i|]?|kal|cal|kc)$/;
const KJ = /^(kj|k[\]|)1]|j|k)$/;

// Números de un tramo con la unidad que los sigue. Cada uno trae sus lecturas posibles:
// tal cual; sin el 9 final si no tiene unidad escrita (era la "g": "189" → 18); y con la coma
// que se perdió ("48g" → 4,8; "159" → 1,5; "069" → 0,6; "02 g" → 0,2). Elige la combinación
// que cierra (ver parseLabelText).
function tokens(seg){
  const out = [];
  const re = /(\d+(?:[.,]\d+)?)\s*(%|k[ceo]a[l1i|]?|kal|cal|kc|kj|k[\]|)1]|mg|ml|cc|ug|(?:g|y|q)(?![a-z])|j|k)?/gi;
  let m;
  while ((m = re.exec(seg))){
    const raw = m[1], unit = (m[2] || "").toLowerCase();
    if (unit === "%" || unit === "mg" || unit === "ug") continue;
    const alts = [];
    const add = (str, bonus) => {
      const v = parseFloat(str.replace(",", "."));
      if (isFinite(v) && !alts.some(a => Math.abs(a.v - v) < 1e-9)) alts.push({ v, bonus });
    };
    const withComma = (str, bonus) => { // "48" → 4,8 · "06" → 0,6
      if (/^\d{2,3}$/.test(str)) add(str.slice(0, -1) + "." + str.slice(-1), bonus);
    };
    const nine = !unit && raw.length >= 2 && raw.endsWith("9");
    if (/^0\d{1,2}$/.test(raw) && !nine) withComma(raw, 0.3); // "02 g" → 0,2 (el cero adelante delata la coma)
    add(raw, /^0\d/.test(raw) ? -0.5 : 0);
    if (nine){
      const cut = raw.slice(0, -1);
      if (cut && !/[.,]$/.test(cut)){ add(cut, cut.length > 1 && cut[0] === "0" ? -0.5 : 0.2); withComma(cut, cut[0] === "0" ? 0.3 : -0.4); }
    }
    withComma(raw, -0.5);
    // "Tiene pinta de gramos": unidad escrita, coma, o el 9 final que era la "g".
    const grams = /^(g|y|q)$/.test(unit) || /[.,]/.test(raw) || nine;
    out.push({ raw, unit, alts, grams });
  }
  return out;
}

// Porción: "Porción 30 g (1 trozo)", "Porción: 200 ml", "Porción: 25,2 y (9 caramelos)",
// "Porción: 2 galletitas (30 g)", "Por porción de 50 g", o el renglón "70 g (1 alfajor)"
// cuando "Porción:" quedó arriba. La "porción de referencia de 40 g" no es la del paquete.
// sure = la porción se leyó con su unidad (sin eso no se da la lectura por buena).
function findPortion(lines){
  const make = (num, unit, sure) => {
    const v = parseFloat(String(num).replace(",", "."));
    return v >= 1 && v <= 1000 ? { size: v, ml: /^(ml|cc)$/.test(unit || ""), sure } : null;
  };
  for (const l of lines){
    const re = /porci[o0]n\b\s*:?\s*(de\s*)?(\d+(?:[.,]\d+)?)\s*(?:(ml|cc|gr|g|y|q)(?![a-z])|(9)(?![0-9]))?/g;
    let m;
    while ((m = re.exec(l))){
      const before = l.slice(Math.max(0, m.index - 12), m.index);
      if (/referencia\s*(de\s*)?$/.test(before)) continue;
      if (/por\s*$/.test(before) && !m[1]) continue; // "Cant. por porción" es el título de la columna
      let r = null;
      if (m[3] || m[4]) r = make(m[2], m[3], true);
      else {
        // Sin unidad: "(30 g)" más adelante en el renglón, o el 9 final que era la "g" ("309").
        const par = /\(\s*(\d+(?:[.,]\d+)?)\s*(ml|cc|gr|g)\s*\)/.exec(l.slice(m.index + m[0].length));
        if (par) r = make(par[1], par[2], true);
        else if (/^\d{2,4}$/.test(m[2]) && m[2].endsWith("9")) r = make(m[2].slice(0, -1), "g", false);
        else r = make(m[2], "g", false);
      }
      if (r) return r;
    }
  }
  for (const l of lines){
    const m = /^\W{0,3}(\d+(?:[.,]\d+)?)\s*(ml|cc|gr|g|y|q)\s*\(\s*\d+(?![\d.,]*\s*%)/.exec(l);
    if (m){ const r = make(m[1], m[2], true); if (r) return r; }
  }
  return null;
}

// "No aporta cantidades significativas de proteínas, grasas totales…": esas filas son 0.
function zeroRows(text){
  const n = NRM(text).replace(/\s+/g, " ");
  const m = /no aporta[n]? cantidades significativas de([^(*%]{0,400})/.exec(n);
  if (!m) return {};
  const z = m[1], out = {};
  if (/energ/.test(z)) out.k = true;
  if (/carbohid|hidratos/.test(z)) out.c = true;
  if (/prote/.test(z)) out.p = true;
  if (/grasas? tot|lipidos/.test(z)) out.f = true;
  return out;
}

// Mejor combinación de candidatos (uno por fila): la que más puntúa sumando lo leído y si las
// calorías cierran con 4/4/9 (el cierre no depende de la escala: sirve cada 100 y por porción).
function bestCombo(C, per100){
  let best = null;
  for (const K of C.k) for (const P of C.p) for (const Cc of C.c) for (const F of C.f){
    if (per100 && P.v != null && Cc.v != null && F.v != null && P.v + Cc.v + F.v > 102) continue;
    let s = K.score + P.score + Cc.score + F.score, err = null;
    if (K.v != null && P.v != null && Cc.v != null && F.v != null){
      const calc = 4 * P.v + 4 * Cc.v + 9 * F.v;
      err = Math.abs(K.v - calc) / Math.max(K.v, 20);
      s += err <= 0.08 ? 4 : err <= 0.15 ? 2.5 : err <= 0.25 ? 0.5 : (K.v < calc && Cc.v > 50 ? -1 : -3); // < por polialcoholes (caramelos sin azúcar)
    }
    if (!best || s > best.s) best = { s, err, K: K.v, P: P.v, C: Cc.v, F: F.v, rows: [K, P, Cc, F] };
  }
  return best;
}

// Texto reconocido → { kcal, p, c, f (cada 100), portion, unit, ok, found, notes, perPortion? }.
export function parseLabelText(text){
  const lines = String(text || "").split(/\n+/).map(l => fixZeros(NRM(l)).replace(/de\s+l[oa]s\s+cuales:?/g, " ")).filter(l => l.trim() && !SKIP_LINE.test(l));
  const portion = findPortion(lines);
  let S = portion ? portion.size : null, inferred = false;

  // Tramo de cada fila: desde su nombre hasta la próxima fila del mismo renglón.
  const segs = { k: [], c: [], p: [], f: [] };
  let energyLine = -1, energyAt = 0;
  lines.forEach((l, li) => {
    const marks = [];
    for (const key of Object.keys(ROWS)){ ROWS[key].lastIndex = 0; let m; while ((m = ROWS[key].exec(l))) marks.push({ key, start: m.index, end: m.index + m[0].length }); }
    STOP.lastIndex = 0; let m; while ((m = STOP.exec(l))) marks.push({ key: null, start: m.index, end: m.index + m[0].length });
    marks.sort((a, b) => a.start - b.start);
    marks.forEach((mk, i) => {
      if (!mk.key) return;
      const next = marks.slice(i + 1).find(x => x.start >= mk.end);
      segs[mk.key].push(l.slice(mk.end, next ? next.start : l.length));
      if (mk.key === "k" && energyLine < 0){ energyLine = li; energyAt = mk.start; }
    });
  });

  // Encabezado de las columnas: los renglones de antes de la fila de energía (y lo que está
  // antes del nombre de esa fila), sin el peso neto ni el renglón de la porción.
  const headLines = (energyLine >= 0 ? lines.slice(0, energyLine).concat(lines[energyLine].slice(0, energyAt)) : lines)
    .filter(l => !/\bneto\b|peso|cont\.?\s*net/.test(l)).map(l => l.replace(/porci[o0]n\s*:?\s*(de\s*)?\d+(?:[.,]\d+)?\s*(ml|cc|gr|g|y|q|9)?/g, " "));
  const H100 = /(por|x|cada)\s*100\s*(g|ml|cc|9|q|y)?(?![a-z0-9])|(^|[\s|(])100\s*(g|ml|cc|q|y)(?![a-z])|(^|[\s|(])1009(?![0-9])/;
  const hasPer100 = headLines.some(l => /(por|x|cada)\s*100/.test(l) || (/porci[o0]n|cant/.test(l) && H100.test(l)));
  // ¿Primero "por porción" y después "cada 100"? (algunas marcas lo imprimen al revés)
  let porcionFirst = false;
  headLines.forEach(l => {
    const hp = l.search(/por\s*porci[o0]n|(^|[\s|])porci[o0]n(?![a-z])/), h1 = l.search(H100);
    if (hp >= 0 && h1 >= 0 && hp < h1) porcionFirst = true;
  });
  const headText = headLines.join(" ");

  // Lo impreso por porción viene redondeado (kcal enteras, gramos con un decimal).
  const near = (a, b, isK) => Math.abs(a - b) <= (isK ? Math.max(3, 0.06 * Math.max(a, b)) : Math.max(0.15, 0.12 * Math.max(a, b)));
  const rowTokens = key => {
    let toks = [];
    segs[key].forEach(s => { toks = toks.concat(tokens(s)); });
    if (key === "k"){
      // Energía: los kcal primero; los kJ sirven como respaldo (÷ 4,184).
      toks = toks.map(t => {
        if (KJ.test(t.unit)) return Object.assign({}, t, { alts: t.alts.map(a => ({ v: a.v / 4.184, bonus: a.bonus - 0.8 })), kj: true });
        if (KCAL.test(t.unit)) return Object.assign({}, t, { alts: t.alts.map(a => ({ v: a.v, bonus: a.bonus + 0.6 })) });
        return t;
      }).filter(t => t.alts.some(a => a.v > 0 || t.raw === "0"));
    }
    // Un entero sin unidad después de un valor en gramos es la columna "% VD".
    if (key !== "k"){ const firstG = toks.findIndex(t => t.grams); if (firstG >= 0) toks = toks.filter((t, i) => i <= firstG || t.grams); }
    toks = toks.slice(0, 6);
    // Columnas al revés: se ponen primero los valores cada 100.
    if (porcionFirst){
      [false, true].forEach(kj => {
        const idx = toks.map((t, i) => (!!t.kj === kj ? i : -1)).filter(i => i >= 0);
        if (idx.length >= 2){ const a = toks[idx[0]]; toks[idx[0]] = toks[idx[1]]; toks[idx[1]] = a; }
      });
    }
    return toks;
  };
  const T = { k: rowTokens("k"), c: rowTokens("c"), p: rowTokens("p"), f: rowTokens("f") };

  // Porción no leída pero la tabla trae las dos columnas: sale de la proporción entre
  // "cada 100" y "por porción", si al menos dos filas coinciden.
  if (!S){
    const ratios = [];
    ["k", "c", "p", "f"].forEach(key => {
      const toks = T[key].filter(t => !t.kj);
      if (toks.length < 2) return;
      toks[0].alts.forEach(a => toks[1].alts.forEach(b => { if (a.v >= (key === "k" ? 10 : 0.5) && b.v > 0) ratios.push({ key, r: b.v / a.v }); }));
    });
    let bestR = null;
    ratios.forEach(x => {
      const keys = new Set(ratios.filter(y => Math.abs(y.r - x.r) <= 0.08 * x.r).map(y => y.key));
      if (keys.size >= 2 && x.r >= 0.05 && x.r <= 10 && (!bestR || keys.size > bestR.n)) bestR = { r: x.r, n: keys.size };
    });
    if (bestR){ S = Math.round(bestR.r * 100); inferred = true; }
  }

  // Pares "cada 100" / "por porción" que cierran con la porción.
  const pairs = key => {
    const out = [], toks = T[key];
    if (!S) return out;
    for (let i = 0; i < toks.length; i++) for (let j = i + 1; j < toks.length; j++){
      if (!!toks[i].kj !== !!toks[j].kj) continue;
      if (key === "k" ? !(KCAL.test(toks[j].unit) || KJ.test(toks[j].unit)) : !toks[j].grams) continue; // la otra columna trae unidad
      for (const a of toks[i].alts) for (const b of toks[j].alts){
        if (near(a.v * S / 100, b.v, key === "k")) out.push({ v: a.v, score: 3 + a.bonus + b.bonus - 0.2 * i, conf: a.v > 0 || b.v > 0, pair: true });
      }
    }
    return out;
  };
  // Un par 0 / 0 cierra con cualquier porción: no cuenta para saber cómo viene la tabla.
  const pairCount = ["k", "c", "p", "f"].filter(k => pairs(k).some(x => x.conf)).length;
  const per100First = hasPer100 || pairCount >= 2 || inferred;
  const Z = zeroRows(text);

  // Candidatos (valor cada 100) de cada fila según cómo viene la tabla.
  const cands = key => {
    const toks = T[key], out = [];
    if (per100First){
      out.push(...pairs(key));
      toks.slice(0, 2).forEach((t, i) => t.alts.forEach(a => out.push({ v: a.v, score: (i ? 0.3 : 1) + a.bonus })));
    } else if (S){
      toks.slice(0, 3).forEach((t, i) => t.alts.forEach(a => out.push({ v: a.v * 100 / S, score: 1 - 0.3 * i + a.bonus })));
    }
    const max = key === "k" ? 950 : 100;
    return out.filter(x => x.v >= 0 && x.v <= max);
  };
  const oneColNoPortion = !S && !per100First;
  const C = { k: cands("k"), c: cands("c"), p: cands("p"), f: cands("f") };
  ["k", "c", "p", "f"].forEach(k => {
    if (Z[k] && !oneColNoPortion) C[k].push({ v: 0, score: C[k].length ? 0.5 : 2, zero: true });
    C[k].push({ v: null, score: -2.5 }); // fila que no se pudo leer
  });
  const best = bestCombo(C, true);

  const r1 = v => v == null ? null : Math.round(v * 10) / 10;
  const res = { kcal: best && best.K != null ? Math.round(best.K) : null, p: r1(best && best.P), c: r1(best && best.C), f: r1(best && best.F),
    portion: S ? Math.round(S) : null, unit: (portion ? portion.ml : /(^|[^0-9.,])100\s*(ml|cc)(?![a-z])/.test(headText)) ? "ml" : "g", notes: [] };
  // Si falta una sola fila y están las calorías, se calcula (queda marcada para revisar).
  const miss = ["p", "c", "f"].filter(k => res[k] == null);
  if (res.kcal != null && miss.length === 1){
    const k = miss[0], w = { p: 4, c: 4, f: 9 }[k];
    const v = (res.kcal - ["p", "c", "f"].filter(x => x !== k).reduce((a, x) => a + { p: 4, c: 4, f: 9 }[x] * res[x], 0)) / w;
    if (v >= -0.5 && v <= 100){ res[k] = r1(Math.max(0, v)); res.notes.push("calc-" + k); }
  }
  if (res.kcal == null && miss.length === 0){ res.kcal = Math.round(4 * res.p + 4 * res.c + 9 * res.f); res.notes.push("calc-kcal"); }
  res.found = ["kcal", "p", "c", "f"].filter(k => res[k] != null).length;
  // "ok" = los cuatro leídos, las calorías cierran y se sabe cómo viene la tabla:
  // - dos columnas confirmadas (dos filas o más con su par): cada fila tiene que ser un par
  //   confirmado o un cero;
  // - si no, la porción leída con su unidad (una columna por porción).
  const confirmed = best ? best.rows.filter(x => x.conf || x.zero || (x.pair && x.v === 0)).length : 0;
  res.ok = res.found === 4 && !res.notes.length && best.err != null && best.err <= 0.1 &&
    (pairCount >= 2 ? confirmed === 4 : (!per100First && !!portion && portion.sure));
  if (inferred) res.notes.push("porcion-calculada");
  // Tabla de una sola columna (por porción) sin la porción legible: se devuelven los valores
  // por porción (elegidos con el mismo cierre 4/4/9); al poner la porción, la app los pasa a cada 100.
  if (oneColNoPortion){
    const PC = {};
    ["k", "c", "p", "f"].forEach(key => {
      const max = key === "k" ? 2500 : 500;
      PC[key] = [];
      T[key].slice(0, 3).forEach((t, i) => t.alts.forEach(a => { if (a.v >= 0 && a.v <= max) PC[key].push({ v: a.v, score: 1 - 0.3 * i + a.bonus }); }));
      if (Z[key]) PC[key].push({ v: 0, score: PC[key].length ? 0.5 : 2 });
      PC[key].push({ v: null, score: -2.5 });
    });
    const bp = bestCombo(PC, false);
    const pp = { kcal: bp.K != null ? Math.round(bp.K) : null, p: r1(bp.P), c: r1(bp.C), f: r1(bp.F) };
    if (["kcal", "p", "c", "f"].some(k => pp[k] != null)) res.perPortion = pp;
  }
  if (!S && !hasPer100) res.notes.push("sin-porcion");
  return res;
}

// ---- Reconocimiento (Tesseract dentro del celular) ----
const BASE = new URL("../../vendor/tesseract/", import.meta.url).href;
let _lib = null, _worker = null, _onProgress = null;
function loadLib(){
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!_lib) _lib = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = BASE + "tesseract.min.js"; s.async = true;
    s.onload = () => window.Tesseract ? res(window.Tesseract) : rej(new Error("No se pudo cargar el lector"));
    s.onerror = () => { _lib = null; s.remove(); rej(new Error("No se pudo cargar el lector")); };
    document.head.appendChild(s);
  });
  return _lib;
}
// Con SIMD (casi todos los celulares de hoy) el lector es bastante más rápido.
const SIMD = (() => { try { return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,15,253,98,11])); } catch (e) { return false; } })();
// Al armar la app de Android, Gradle descomprime los archivos .gz y les saca la extensión:
// ahí el idioma queda como spa.traineddata (el lector acepta los dos formatos).
const ANDROID = (() => { try { return window.Capacitor.getPlatform() === "android"; } catch (e) { return false; } })();
const timeout = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

// El lector se prepara una vez (baja ~6 MB la primera vez) y queda listo para las próximas
// fotos. Si falla o tarda demasiado (sin señal a mitad de la descarga), se descarta y el
// próximo intento arranca de cero. Tesseract no rechaza createWorker cuando falla el idioma:
// por eso el errorHandler y el tiempo límite.
function getWorker(){
  if (_worker) return _worker;
  let fail;
  const failed = new Promise((_, rej) => { fail = rej; });
  const created = loadLib().then(T => T.createWorker("spa", 1, {
    workerPath: BASE + "worker.min.js", workerBlobURL: false,
    corePath: BASE + (SIMD ? "tesseract-core-simd-lstm.wasm.js" : "tesseract-core-lstm.wasm.js"),
    langPath: BASE.replace(/\/$/, ""), gzip: !ANDROID,
    logger: m => { if (_onProgress && m && typeof m.progress === "number") _onProgress(m.status, m.progress); },
    errorHandler: e => fail(new Error(String(e && e.message || e))),
  }));
  const p = Promise.race([created, failed, timeout(120000, "El lector tardó demasiado en prepararse")]);
  _worker = p;
  p.catch(() => {
    if (_worker === p) _worker = null;
    created.then(w => w.terminate(), () => {}); // si terminaba de armarse después, se libera
  });
  return p;
}
function dropWorker(){
  const w = _worker; _worker = null;
  if (w) w.then(x => x.terminate(), () => {});
}

// Foto → canvas de un tamaño que el lector maneja bien (la letra de las tablas es chica:
// se agranda hasta ~2000 px de lado; más grande solo lo hace más lento).
async function prepare(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("No se pudo abrir la foto")); i.src = url; });
    const W = img.naturalWidth, H = img.naturalHeight, k = Math.min(2, 2000 / Math.max(W, H));
    const cv = document.createElement("canvas"); cv.width = Math.round(W * k); cv.height = Math.round(H * k);
    cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
    return cv;
  } finally { URL.revokeObjectURL(url); }
}

// Foto de la tabla → valores cada 100 (ver parseLabelText). onProgress(texto, 0..1).
export async function readLabel(file, onProgress){
  _onProgress = onProgress || null;
  const cv = await prepare(file);
  const w = await getWorker();
  let r;
  try { r = await Promise.race([w.recognize(cv), timeout(90000, "La lectura tardó demasiado")]); }
  catch (e) { dropWorker(); throw e; }
  return parseLabelText(r && r.data ? r.data.text : "");
}

import { EX_DB } from './data.js';

export const uid = () => Math.random().toString(36).slice(2, 9);

export const mkSet = (target) => { const s = { id: uid(), kg: "", reps: "", targetKg: "", done: false }; if (target) s.target = target; return s; };

export const mkSets = n => Array.from({ length: n }, mkSet);

export const mkEx = (name, n, mus) => { const e = { id: uid(), name, sets: mkSets(n) }; if (mus) e.mus = mus; return e; };

export const mkExT = (name, mus, targets, note, opt) => { const e = { id: uid(), name, sets: targets.map(t => mkSet(t)) }; if (mus) e.mus = mus; if (note) e.note = note; if (opt) { if(opt.o) e.o=opt.o; if(opt.rir) e.rir=opt.rir; if(opt.rest) e.rest=opt.rest; if(opt.goal) e.goal=opt.goal; } return e; };

// Error de Supabase Storage al subir una foto → texto para el usuario. Storage responde
// en inglés ("The object exceeded the maximum allowed size", "mime type … is not
// supported") cuando la foto supera el límite del bucket o no es de un tipo permitido.
export function storageErrorText(err, maxMb){
  const m = String((err && (err.message || err.error)) || err || "");
  const st = String((err && (err.statusCode || err.status)) || "");
  if (st === "413" || /exceeded the maximum|too large/i.test(m)) return "La foto pesa demasiado" + (maxMb ? " (máximo " + maxMb + " MB)" : "") + ".";
  if (st === "415" || /mime type|not supported|invalid_mime/i.test(m)) return "Ese archivo no es una foto compatible. Usá una imagen JPG, PNG, WEBP o HEIC.";
  return m;
}

// Fecha local YYYY-MM-DD. No usar toISOString(): pasa a UTC y, según la zona horaria,
// devuelve el día anterior o el siguiente.
export function ymd(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }

// Número escrito por el usuario: acepta coma decimal ("82,5", el teclado de iPhone en
// español pone coma). Vacío o inválido → 0.
export const num = v => parseFloat(String(v == null ? "" : v).replace(",", ".")) || 0;

// Número entero escrito por el usuario, con o sin separador de miles ("8.500", "10 000").
export const intNum = v => parseInt(String(v == null ? "" : v).replace(/[.\s]/g, ""), 10);

export function today(){ return ymd(new Date()); }

export function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

export const norm = s => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");

export function fmt(ms, ceil){ let s = ceil?Math.ceil(ms/1000):Math.floor(ms/1000); if(s<0)s=0;
  const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
  const mm=String(m).padStart(2,"0"), ss=String(sec).padStart(2,"0"); return h>0 ? h+":"+mm+":"+ss : mm+":"+ss; }

export function hkey(name){ return today()+"|"+name; }

export function mondayOf(dstr){ const d=new Date((dstr||today())+"T00:00:00"); const wd=(d.getDay()+6)%7; d.setDate(d.getDate()-wd); return ymd(d); }

export function fmtDate(d){ const p=(d||"").split("-"); if(p.length!==3) return d; const m=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]; return parseInt(p[2],10)+" "+(m[parseInt(p[1],10)-1]||""); }

export function fmtDInput(d){ const p=(d||"").split("-"); if(p.length!==3) return d; return p[2]+"/"+p[1]+"/"+p[0]; }

export function muscleOf(name){ const n=(name||"").trim().toLowerCase(); for(const cat in EX_DB){ if(EX_DB[cat].some(x=>x.toLowerCase()===n)) return cat; } return "otros"; }

// Los aductores estaban dentro de glúteos: las rutinas guardadas antes siguen diciendo "gluteos".
const ADUCTOR_RE = /\baducci[oó]n|\baductor/i;
// Grupo de un ejercicio que se elige de la lista. Si está en más de un grupo (Curl martillo:
// bíceps y antebrazo), cuenta para el grupo desde donde se eligió.
export function pickMuscle(name, cat){
  const n=(name||"").trim().toLowerCase();
  if(cat && EX_DB[cat] && EX_DB[cat].some(x=>x.toLowerCase()===n)) return cat;
  const m=muscleOf(name); return m!=="otros" ? m : (cat||"otros");
}
// Resultados de búsqueda en todos los grupos: [{name, cat, label}]; si el nombre está en más
// de un grupo, sale una vez por grupo con el grupo al lado ("Curl martillo · Antebrazo").
export function searchExercises(match, cats){
  const res=[], count={};
  for(const k in EX_DB) EX_DB[k].forEach(n=>{ if(match(n)){ res.push({name:n, cat:k}); count[n]=(count[n]||0)+1; } });
  const lbl=k=>((cats||[]).find(c=>c[0]===k)||[k,k])[1];
  return res.map(r=>Object.assign(r, {label: count[r.name]>1 ? r.name+" · "+lbl(r.cat) : r.name}));
}

export function exMuscle(ex){
  if(ex && ADUCTOR_RE.test(ex.name || "") && (!ex.mus || ex.mus === "gluteos" || !EX_DB[ex.mus])) return "aductores";
  if(ex && ex.mus && EX_DB[ex.mus]) return ex.mus;
  return muscleOf(ex && ex.name);
}

export function tabRipple(btn, clientX, clientY){
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height) * 2.2;
  const x = (typeof clientX==="number" ? clientX : rect.left+rect.width/2) - rect.left - size/2;
  const y = (typeof clientY==="number" ? clientY : rect.top+rect.height/2) - rect.top - size/2;
  const span = document.createElement("span");
  span.className = "tab-ripple";
  span.style.width = span.style.height = size+"px";
  span.style.left = x+"px"; span.style.top = y+"px";
  btn.appendChild(span);
  setTimeout(()=>{ span.remove(); }, 520);
}

// ---- Ejercicios por tiempo (plancha, isométricos, colgado de barra…) ----
// En vez de reps se anotan segundos, y cada serie tiene un cronómetro. El coach lo elige por
// ejercicio (ex.timed); si no eligió nada se deduce del nombre.
const TIMED_RE = /plancha|plank|isom[eé]tric|hollow|wall ?sit|sentadilla (isom|en (la )?pared|contra (la )?pared)|dead ?hang|colgad|l-?sit|puente (isom|sostenid)|sostenid|\bhold\b|farmer|paseo del granjero|caminata del granjero/i;
export function isTimedEx(ex){ if(!ex) return false; if(typeof ex.timed === "boolean") return ex.timed; return TIMED_RE.test(ex.name || ""); }
// "45", "45 s", "45''", "0:45", "1:30", "1'30", "1 min" → segundos. Un rango ("30-45") toma el primero.
export function parseSecs(v){
  const t = String(v == null ? "" : v).trim().toLowerCase(); if(!t) return 0;
  let m = t.match(/^(\d+)\s*[:'´]\s*(\d{1,2})\b/); if(m) return (+m[1]) * 60 + (+m[2]);
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*(min|m\b|'(?!'))/); if(m) return Math.round(parseFloat(m[1].replace(",", ".")) * 60);
  m = t.match(/(\d+)/); return m ? Math.min(+m[1], 36000) : 0;
}
export function fmtSecs(s){ s = Math.max(0, Math.round(+s || 0)); const m = Math.floor(s / 60), r = s % 60; return m ? m + ":" + String(r).padStart(2, "0") : r + " s"; }
// Texto de una serie ya hecha: "40 kg × 8", "12 reps", "45 s", "10 kg · 1:00".
export function setText(st){
  const kg = parseFloat(String(st && st.kg || 0).replace(",", ".")) || 0, reps = +(st && st.reps) || 0, secs = +(st && st.secs) || 0;
  const k = (Math.round(kg * 100) / 100).toString().replace(".", ",");
  if(secs > 0) return (kg > 0 ? k + " kg · " : "") + fmtSecs(secs);
  if(kg > 0) return k + " kg" + (reps > 0 ? " × " + reps : "");
  return reps > 0 ? reps + " reps" : "—";
}

import { ES_DAYS, ES_MAP, EX_DB } from './data.js';

import { state } from './state.js';

import { cloudSyncCore } from './supabase.js';

import { exMuscle, muscleOf, uid } from './utils.js';

export const KEY = "rutina_jero_v1";

// Huella de la rutina para saber si cambió en el celular desde la última vez que quedó igual
// que en la nube (state.routineHash). Si el celular no pudo sincronizar (sin señal en el
// gimnasio) y el cliente armó o cambió su rutina, al volver la conexión la nube NO la pisa:
// se compara la hora de ese cambio (state.routineEditedAt) con la de la nube (ver loadCloud).
export function routineHash(days){
  const s=JSON.stringify(days||[]); let h=5381;
  for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0;
  return (h>>>0).toString(36)+"."+s.length;
}
let _seenRoutine=null;
try { _seenRoutine=routineHash(state.days); } catch(e) {}
function noteRoutineEdit(){
  const h=routineHash(state.days);
  if(_seenRoutine!==null && h!==_seenRoutine && h!==state.routineHash) state.routineEditedAt=Date.now();
  _seenRoutine=h;
}
// La rutina local quedó igual a la de la nube (se bajó o se subió).
export function markRoutineSynced(days){
  state.routineHash=routineHash(days);
  _seenRoutine=routineHash(state.days);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e) {}
}

export function save(){ try { noteRoutineEdit(); } catch(e) {} try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e) {} try { cloudSyncCore(); } catch(e){} }

// Los id de la rutina van dentro del HTML (data-ex, data-set…). La rutina la puede escribir
// otra persona (el coach, o el cliente antes de vincularse), así que un id raro se cambia
// por uno nuevo en vez de confiar en que venga limpio. Lo mismo el link de video: solo https.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
function badId(o){ return o && o.id != null && !SAFE_ID.test(String(o.id)); }

export function migrateNames(days){
  let changed=false;
  (days||[]).forEach(d=>{
    if(badId(d)){ d.id=uid(); changed=true; }
    if(ES_DAYS[d.name]){ d.name=ES_DAYS[d.name]; changed=true; }
    (d.exercises||[]).forEach(ex=>{
      if(badId(ex)){ ex.id=uid(); changed=true; }
      (ex.sets||[]).forEach(st=>{ if(badId(st)){ st.id=uid(); changed=true; } });
      if(ex.video && !/^https:\/\//i.test(String(ex.video))){ delete ex.video; changed=true; }
      if(ES_MAP[ex.name]){ ex.name=ES_MAP[ex.name]; changed=true; }
      if(!ex.mus || !EX_DB[ex.mus]){ const m=muscleOf(ex.name); if(m!=="otros"){ ex.mus=m; changed=true; } }
      { const m=exMuscle(ex); if(m==="aductores" && ex.mus!==m){ ex.mus=m; changed=true; } }
    });
  });
  return changed;
}

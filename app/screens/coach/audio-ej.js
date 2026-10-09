// Explicación de voz del coach en cada ejercicio (supabase/ejercicio-audio.sql): lo que no
// entra en la nota ni en el video ("sentí cómo se estira el pecho abajo…"). Se graba en el
// editor de la rutina y el alumno la escucha en Entreno, en la tarjeta del ejercicio.
// El audio va a la carpeta del coach ({coach}/ex/…): sirve igual al copiar la rutina o un
// día a otro alumno, o al guardarla como plantilla. En el ejercicio quedan "audio" (ruta) y
// "audioSecs". Como cualquier cambio de la rutina, se manda con "Guardar rutina".

import { State } from '../../core/state.js';

import { esc } from '../../core/utils.js';

import { CoachState } from './state.js';

import { renderCoach } from './index.js';

import { rtDays } from './rutinas.js';

import { AUDIO_CUPO, Player, audioState, extFor, mmss, newAudioName, signedAudioUrl, startRecorder, togglePlay, uploadAudio } from '../../ui/grabar.js';

const MAX_SECS = 180;
export const EX_AUDIO_RE = /^[0-9a-f-]{36}\/ex\/[A-Za-z0-9_-]{8,64}\.(webm|mp4|m4a|ogg|aac)$/;

const micSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>';
const playSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
const pauseSvg = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';

// Grabación en curso: { ex, rec, t0 } o { ex, uploading: true }.
let R = null;

export function renderExAudio(ex, i){
  const cur = R && R.ex === ex ? R : null;
  let inner;
  if(cur && cur.uploading){
    inner = '<span class="ea-note">Subiendo el audio…</span>';
  } else if(cur){
    inner = '<span class="ea-rec-dot" aria-hidden="true"></span><span class="ea-t" id="coExRecT">' + mmss((Date.now() - cur.t0) / 1000) + '</span>' +
      '<button class="ea-btn on" data-coach="ea-stop" data-i="' + i + '">Listo</button>' +
      '<button class="ea-btn ghost" data-coach="ea-cancel" data-i="' + i + '">Descartar</button>';
  } else if(ex.audio && EX_AUDIO_RE.test(ex.audio)){
    const st = audioState("ex:" + ex.audio);
    inner = '<button class="ea-btn ea-play" data-coach="ea-play" data-i="' + i + '" data-path="' + esc(ex.audio) + '">' + (st.playing ? pauseSvg : playSvg) +
        ' <span>' + (st.playing ? 'Pausar' : 'Escuchar') + ' (' + mmss(ex.audioSecs) + ')</span></button>' +
      '<button class="ea-btn ghost" data-coach="ea-rec" data-i="' + i + '">Grabar de nuevo</button>' +
      '<button class="ea-btn ghost danger" data-coach="ea-del" data-i="' + i + '">Borrar</button>';
  } else {
    inner = '<button class="ea-btn" data-coach="ea-rec" data-i="' + i + '">' + micSvg + ' <span>Grabar explicación</span></button>' +
      '<span class="ea-note">Hasta 3 minutos. Tu alumno la escucha en el ejercicio.</span>';
  }
  return '<div class="co-note-wrap"><span class="co-note-lbl">Explicación de voz</span><div class="ea-row">' + inner + '</div></div>';
}

function exAt(i){ const day = (rtDays() || [])[CoachState.coachEditDay]; return day && day.exercises[+i]; }

async function start(ex){
  if(R) return;
  if(!State.cloudUser) return;
  R = { ex, starting: true };
  const rec = await startRecorder({
    maxSecs: MAX_SECS,
    onTick: s => { const el = document.getElementById("coExRecT"); if(el) el.textContent = mmss(s); },
    onDone: (blob, type, secs) => save(ex, blob, type, secs),
    onEnd: () => { if(R && R.rec === rec && !R.uploading){ R = null; renderCoach(); } },
  });
  if(!rec){ R = null; renderCoach(); return; }
  R = { ex, rec, t0: rec.t0 };
  renderCoach();
}

async function save(ex, blob, type, secs){
  R = { ex, uploading: true }; renderCoach();
  const path = State.cloudUser.id + "/ex/" + newAudioName() + "." + extFor(type);
  const err = await uploadAudio(path, blob, type);
  R = null;
  if(err){ renderCoach(); alert(err === AUDIO_CUPO ? err : "No se pudo subir el audio. Revisá la conexión y probá de nuevo."); return; }
  ex.audio = path; ex.audioSecs = secs;
  renderCoach();
}

document.body.addEventListener("click", e => {
  const b = e.target.closest('[data-coach^="ea-"]'); if(!b || b.disabled) return;
  const a = b.dataset.coach, ex = exAt(b.dataset.i); if(!ex) return;
  if(a === "ea-rec") start(ex);
  else if(a === "ea-stop"){ if(R && R.rec) R.rec.stop(false); }
  else if(a === "ea-cancel"){ if(R && R.rec) R.rec.stop(true); }
  else if(a === "ea-play") togglePlay("ex:" + ex.audio, () => signedAudioUrl(ex.audio));
  else if(a === "ea-del"){ if(confirm("¿Borrar la explicación de voz de este ejercicio?")){ delete ex.audio; delete ex.audioSecs; renderCoach(); } }
});

// El botón de escuchar cambia entre play y pausa sin redibujar todo el editor.
Player.subs.add(() => {
  document.querySelectorAll('#coachHost [data-coach="ea-play"]').forEach(b => {
    const st = audioState("ex:" + b.dataset.path);
    const secs = (b.querySelector("span") || {}).textContent;
    const m = /\(([^)]*)\)/.exec(secs || "");
    b.innerHTML = (st.playing ? pauseSvg : playSvg) + ' <span>' + (st.playing ? 'Pausar' : 'Escuchar') + (m ? ' (' + m[1] + ')' : '') + '</span>';
  });
});

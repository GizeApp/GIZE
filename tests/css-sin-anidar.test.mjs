// Nada de CSS anidado (una regla adentro de otra, con o sin &): los motores web de antes de
// 2023 (Android con el WebView sin actualizar) descartan la regla entera y con ella todo lo
// que tiene adentro. Pasó con el diseño de los botones: en esos celulares se perdía completo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newPage, wait } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', 'android', 'ios', '.git', 'tests']);

function cssFiles(dir, out = []){
  for (const e of fs.readdirSync(dir, { withFileTypes: true })){
    if (SKIP.has(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) cssFiles(f, out);
    else if (e.name.endsWith('.css')) out.push(f);
  }
  return out;
}

// Devuelve las líneas donde empieza una regla de estilo (o un @media) dentro de otra regla de estilo.
function nested(src){
  src = src.replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '));
  const stack = [], found = [];
  let buf = '', line = 1;
  for (const ch of src){
    if (ch === '\n') line++;
    if (ch === '{'){
      const pre = buf.trim(); buf = '';
      const inKeyframes = stack.length && stack[stack.length - 1] === 'keyframes';
      const kind = /^@(-webkit-)?keyframes/.test(pre) ? 'keyframes' : pre.startsWith('@') ? 'at' : inKeyframes ? 'frame' : 'rule';
      if ((kind === 'rule' || kind === 'at') && stack.includes('rule')) found.push(line + ': ' + pre.replace(/\s+/g, ' ').slice(0, 60));
      stack.push(kind);
    } else if (ch === '}'){ stack.pop(); buf = ''; }
    else if (ch === ';') buf = '';
    else buf += ch;
  }
  return found;
}

export default async function ({ base, t }){
  const files = cssFiles(ROOT);
  t.ok(files.length > 10, 'se encontraron los archivos de estilos: ' + files.length);
  for (const f of files){
    const bad = nested(fs.readFileSync(f, 'utf8'));
    t.eq(bad, [], path.relative(ROOT, f) + ': reglas anidadas');
  }
  // Lo mismo en lo que de verdad carga cada página (incluye los <style> del HTML).
  for (const url of ['/app/', '/admin/', '/', '/privacidad/']){
    const { p, errs, close } = await newPage({});
    await p.goto(base + url); await wait(1200);
    const bad = await p.evaluate(() => {
      const out = [];
      const walk = (rules, where) => { for (const r of rules){
        if (r instanceof CSSStyleRule && r.cssRules && r.cssRules.length) out.push(where + ' → ' + r.selectorText.replace(/\s+/g, ' ').slice(0, 60));
        else if (r.cssRules) walk(r.cssRules, where);
      } };
      for (const s of document.styleSheets){ try { walk(s.cssRules, s.href ? s.href.replace(location.origin, '') : '<style>'); } catch (e) {} }
      return out;
    });
    t.eq(bad, [], url + ': reglas anidadas en los estilos que carga la página');
    t.eq(errs, [], url + ': errores de la página');
    await close();
  }
}

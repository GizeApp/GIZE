// Junta en www/ solo lo que usa la app (sin landing, supabase, capturas, etc.), para que
// Capacitor lo empaquete en las apps de Android y iPhone. La web (GitHub Pages) no usa esto.
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
const OUT = "www";
const KEEP = ["manifest.json", "sw.js", "install.js", "app", "css", "brand", "vendor",
  "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"];
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
// De brand/ la app usa solo los SVG, la letra y tokens.css: los logos en PNG (para redes y
// tiendas, ~1,2 MB), las imágenes de los mails y BRAND.md no se empaquetan.
const FUERA = /^brand\/(logo\/[^/]+\.png|mail(\/.*)?|BRAND\.md)$/;
// Para la app de Android (npm run android pasa --android) tampoco va MapLibre (~1,2 MB): ahí nunca
// hay mapa (ui/mapa.js canUseMap). La de iPhone sí lo lleva: npm run ios (y el workflow de iPhone)
// vuelve a armar www/ sin --android.
const ANDROID = process.argv.includes("--android");
const FUERA_ANDROID = /^vendor\/maplibre-gl-[^/]*(\/.*)?$/;
const fuera = src => { const f = src.replace(/\\/g, "/"); return FUERA.test(f) || (ANDROID && FUERA_ANDROID.test(f)); };
for (const f of KEEP) if (existsSync(f)) cpSync(f, `${OUT}/${f}`, { recursive: true, filter: src => !fuera(src) });
// En la web la app está en app/index.html (la raíz es la landing). En el celular va como
// www/index.html, sin el <base href="../"> que en la web apunta a la raíz del sitio.
writeFileSync(`${OUT}/index.html`, readFileSync("app/index.html", "utf8").replace(/<base href="\.\.\/">\n?/, ""));
rmSync(`${OUT}/app/index.html`, { force: true });
console.log("www/ listo" + (ANDROID ? " (Android, sin MapLibre)" : "") + ":", KEEP.filter(existsSync).join(", "));

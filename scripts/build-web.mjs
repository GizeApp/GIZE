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
for (const f of KEEP) if (existsSync(f)) cpSync(f, `${OUT}/${f}`, { recursive: true, filter: src => !FUERA.test(src.replace(/\\/g, "/")) });
// En la web la app está en app/index.html (la raíz es la landing). En el celular va como
// www/index.html, sin el <base href="../"> que en la web apunta a la raíz del sitio.
writeFileSync(`${OUT}/index.html`, readFileSync("app/index.html", "utf8").replace(/<base href="\.\.\/">\n?/, ""));
rmSync(`${OUT}/app/index.html`, { force: true });
console.log("www/ listo:", KEEP.filter(existsSync).join(", "));

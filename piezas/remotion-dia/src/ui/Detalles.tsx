// Detalles recreados que «salen» del celular: la racha, el anillo de calorías, el agua, la cuenta regresiva,
// el resumen, el checklist y la curva de progreso. Animados cuadro a cuadro para darle ritmo a la tipografía.
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { AZUL, FUENTE, MAGENTA, SUAVE, TEXTO, TURQUESA, VIOLETA, clamp, salida } from "../marca";
import { Neon } from "./Neon";

const Tarjeta: React.FC<{ desde: number; children: React.ReactNode; ancho?: number; estilo?: React.CSSProperties }> =
  ({ desde, children, ancho = 520, estilo }) => {
  const f = useCurrentFrame();
  const k = interpolate(f - desde, [0, 14], [0, 1], { ...clamp, easing: Easing.bezier(0.2, 1.3, 0.4, 1) });
  return (
    <div style={{
      width: ancho, padding: "34px 38px", borderRadius: 40, fontFamily: FUENTE, color: TEXTO,
      background: "linear-gradient(160deg, #141a2cf2, #0a0c16f2)", border: "1.5px solid #ffffff22",
      boxShadow: `0 0 0 1px ${VIOLETA}33, 0 0 50px ${VIOLETA}55, 0 30px 70px #000d`,
      opacity: interpolate(f - desde, [0, 6], [0, 1], clamp), scale: interpolate(k, [0, 1], [0.6, 1]),
      translate: `0px ${interpolate(k, [0, 1], [60, 0])}px`, ...estilo,
    }}>{children}</div>
  );
};

const cuenta = (f: number, a: number, b: number, de: number, hasta: number) =>
  Math.round(interpolate(f, [a, b], [de, hasta], { ...clamp, easing: salida }));

export const Racha: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const n = f - desde < 22 ? 12 : 13;
  const salto = interpolate(f - desde, [20, 24, 34], [1, 1.35, 1], clamp);
  return (
    <Tarjeta desde={desde} ancho={440} estilo={{ textAlign: "center" }}>
      <svg width="150" height="170" viewBox="0 0 24 28" style={{ filter: `drop-shadow(0 0 18px ${VIOLETA}) drop-shadow(0 0 40px ${MAGENTA}88)`,
        scale: String(interpolate(f - desde, [20, 26, 40], [1, 1.18, 1], clamp)) }}>
        <defs><linearGradient id="llama" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={MAGENTA} /><stop offset="0.6" stopColor={VIOLETA} /><stop offset="1" stopColor={AZUL} /></linearGradient></defs>
        <path d="M12 1c1 4 5 6.5 5 12.5A5 5 0 0 1 12 19a5 5 0 0 1-5-5.5c0-2.2 1.2-3.6 2.4-4.7C9.6 11 10.6 12 12 12c-1.5-3.2-.6-7.6 0-11z M12 27c-5.5 0-9-3.8-9-8.6 0-4.6 3.1-7.7 5.4-10-.2 2.5.6 4.6 2.4 5.8" fill="url(#llama)" />
      </svg>
      <div style={{ fontSize: 120, fontWeight: 700, lineHeight: 1, scale: String(salto) }}>{n}</div>
      <div style={{ fontSize: 40, fontWeight: 600, color: SUAVE, marginTop: 8 }}>días seguidos</div>
    </Tarjeta>
  );
};

export const Anillo: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const meta = 2179, kcal = cuenta(f, desde + 10, desde + 50, 1230, 1597);
  const r = 120, C = 2 * Math.PI * r;
  return (
    <Tarjeta desde={desde} ancho={440} estilo={{ textAlign: "center" }}>
      <svg width="300" height="300" viewBox="0 0 300 300">
        <defs><linearGradient id="an" x1="0" x2="1"><stop offset="0" stopColor={AZUL} /><stop offset="0.6" stopColor={VIOLETA} /><stop offset="1" stopColor={MAGENTA} /></linearGradient></defs>
        <circle cx="150" cy="150" r={r} stroke="#ffffff18" strokeWidth="22" fill="none" />
        <circle cx="150" cy="150" r={r} stroke="url(#an)" strokeWidth="22" fill="none" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - kcal / meta)} transform="rotate(-90 150 150)"
          style={{ filter: `drop-shadow(0 0 12px ${VIOLETA})` }} />
        <text x="150" y="162" textAnchor="middle" fontFamily={FUENTE} fontWeight={700} fontSize="76" fill={TEXTO}>{kcal}</text>
        <text x="150" y="208" textAnchor="middle" fontFamily={FUENTE} fontWeight={500} fontSize="28" fill={SUAVE}>de {meta} kcal</text>
      </svg>
    </Tarjeta>
  );
};

export const Agua: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const ml = cuenta(f, desde + 12, desde + 40, 1000, 1500);
  return (
    <Tarjeta desde={desde} ancho={460}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontSize: 96, fontWeight: 700 }}>{(ml / 1000).toFixed(1).replace(".", ",")}</span>
        <span style={{ fontSize: 44, fontWeight: 600, color: SUAVE }}>/ 3 L</span>
      </div>
      <div style={{ height: 26, borderRadius: 20, background: "#ffffff15", marginTop: 18, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${ml / 30}%`, borderRadius: 20, background: `linear-gradient(90deg, ${AZUL}, ${TURQUESA})`, boxShadow: `0 0 20px ${AZUL}` }} />
      </div>
      <div style={{ fontSize: 44, fontWeight: 700, color: AZUL, marginTop: 18,
        opacity: interpolate(f - desde, [12, 18, 40, 50], [0, 1, 1, 0.6], clamp) }}>+500 ml 💧</div>
    </Tarjeta>
  );
};

export const Cuenta: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const s = Math.max(0, 120 - Math.floor(Math.max(0, f - desde - 8) / 30 * 3));   // corre a 3× para que se note
  const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const p = 1 - s / 120;
  return (
    <Tarjeta desde={desde} ancho={500} estilo={{ textAlign: "center", padding: "26px 30px 34px" }}>
      <div style={{ fontSize: 36, fontWeight: 600, color: SUAVE, letterSpacing: 4 }}>DESCANSO</div>
      <Neon texto={txt} tamano={150} ancho={440} alto={170} />
      <div style={{ height: 12, borderRadius: 10, background: "#ffffff15", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${p * 100}%`, background: `linear-gradient(90deg, ${AZUL}, ${VIOLETA}, ${MAGENTA})` }} />
      </div>
    </Tarjeta>
  );
};

export const Resumen: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const dato = (v: number, l: string, i: number) => (
    <div style={{ flex: 1, textAlign: "center", opacity: interpolate(f - desde, [6 + i * 5, 12 + i * 5], [0, 1], clamp) }}>
      <div style={{ fontSize: 86, fontWeight: 700, lineHeight: 1, backgroundImage: `linear-gradient(180deg, #fff, ${VIOLETA})`, WebkitBackgroundClip: "text", color: "transparent" }}>
        {cuenta(f, desde + 6 + i * 5, desde + 36 + i * 5, 0, v)}</div>
      <div style={{ fontSize: 32, fontWeight: 600, color: SUAVE, marginTop: 8 }}>{l}</div>
    </div>
  );
  return (
    <Tarjeta desde={desde} ancho={680}>
      <div style={{ fontSize: 40, fontWeight: 700, marginBottom: 22 }}>¡Entreno terminado! 🔥</div>
      <div style={{ display: "flex" }}>{dato(52, "minutos", 0)}{dato(18, "series", 1)}{dato(6, "ejercicios", 2)}</div>
    </Tarjeta>
  );
};

export const Checklist: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const items = ["Tomar 3 L de agua", "10.000 pasos", "Dormir 8 horas"];
  const hechos = items.filter((_, i) => f - desde >= 14 + i * 12).length;
  return (
    <Tarjeta desde={desde} ancho={560}>
      {items.map((t, i) => {
        const ok = f - desde >= 14 + i * 12;
        const k = interpolate(f - desde, [14 + i * 12, 20 + i * 12], [0, 1], clamp);
        return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 20, fontSize: 42, fontWeight: 600, color: ok ? TEXTO : SUAVE }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, border: `3px solid ${ok ? TURQUESA : "#ffffff44"}`, display: "grid", placeItems: "center",
              background: ok ? `${TURQUESA}33` : "transparent", boxShadow: ok ? `0 0 20px ${TURQUESA}88` : "none", scale: String(interpolate(k, [0, 0.5, 1], [1, 1.25, 1])) }}>
              {ok && <span style={{ color: TURQUESA, fontSize: 38, fontWeight: 700 }}>✓</span>}
            </div>
            {t}
          </div>
        );
      })}
      <div style={{ height: 16, borderRadius: 10, background: "#ffffff15", overflow: "hidden", marginTop: 6 }}>
        <div style={{ height: "100%", width: `${interpolate(f - desde, [14, 44], [0, 100], clamp) * (hechos > 0 ? 1 : 0)}%`,
          background: `linear-gradient(90deg, ${TURQUESA}, ${AZUL})`, boxShadow: `0 0 16px ${TURQUESA}` }} />
      </div>
    </Tarjeta>
  );
};

export const Curva: React.FC<{ desde: number }> = ({ desde }) => {
  const f = useCurrentFrame();
  const pts = [[20, 250], [120, 222], [220, 205], [320, 170], [420, 150], [520, 108], [620, 60]];
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
  const L = 760, k = interpolate(f - desde, [8, 48], [0, 1], { ...clamp, easing: salida });
  return (
    <Tarjeta desde={desde} ancho={720} estilo={{ padding: "30px 30px 26px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 40, fontWeight: 700 }}>Press banca</span>
        <span style={{ fontSize: 44, fontWeight: 700, color: TURQUESA, opacity: interpolate(f - desde, [40, 50], [0, 1], clamp) }}>+12,5 kg ↑</span>
      </div>
      <svg width="660" height="290" viewBox="0 0 660 290">
        <defs><linearGradient id="cu" x1="0" x2="1"><stop offset="0" stopColor={AZUL} /><stop offset="0.6" stopColor={VIOLETA} /><stop offset="1" stopColor={MAGENTA} /></linearGradient></defs>
        {[70, 140, 210].map((y) => <line key={y} x1="0" x2="660" y1={y} y2={y} stroke="#ffffff12" strokeWidth="2" />)}
        <path d={d} fill="none" stroke="url(#cu)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray={L} strokeDashoffset={L * (1 - k)} style={{ filter: `drop-shadow(0 0 10px ${VIOLETA}) drop-shadow(0 0 22px ${MAGENTA}88)` }} />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="9" fill="#fff" opacity={k * pts.length > i + 0.5 ? 1 : 0} style={{ filter: `drop-shadow(0 0 8px ${VIOLETA})` }} />
        ))}
      </svg>
    </Tarjeta>
  );
};

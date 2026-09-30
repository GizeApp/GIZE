"""Builds the shared content calendar page from stock/catalog.json + the posting plan below.
  python3 calendar/build.py   ->  calendar/calendario.html  (+ prints the covers map to publish)
Pieces that are not rendered yet show as "En producción"."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                     # showreel/
STOCK = os.path.join(ROOT, "stock")
cat = json.load(open(os.path.join(STOCK, "catalog.json")))
P = {p["id"]: p for p in cat["pieces"]}

END = "\n\nMuy pronto, para iPhone y Android.\nActivá las notificaciones para no perdértelo. 🔔"
EXTRA = {   # planned pieces that are not rendered yet
    "real-01": {"title": "Clip real con overlay #1", "kind": "real", "note": "Con el kit de overlays sobre clips grabados por ustedes (stock/07-overlays).", "caption": "", "hashtags": [], "ready": False},
    "real-02": {"title": "Clip real con overlay #2", "kind": "real", "note": "Con el kit de overlays sobre clips grabados por ustedes (stock/07-overlays).", "caption": "", "hashtags": [], "ready": False},
}
TEASER_TITLES = {"teaser-01-el-punto": "El punto", "teaser-02-la-g": "La G", "teaser-03-el-mapa": "El mapa", "teaser-04-chau": "Chau"}
WORDS = {"ep01-chau-planilla": "PLANILLA", "ep02-chau-notas-del-celu": "NOTAS DEL CELU", "ep03-chau-3-apps": "3 APPS", "ep04-chau-descanso-eterno": "DESCANSO ETERNO", "ep05-chau-papelito": "PAPELITO", "ep06-chau-post-its": "POST-ITS", "ep07-chau-a-ojo": "A OJO", "ep08-chau-40-chats": "40 CHATS"}


def exists(rel):
    return os.path.exists(os.path.join(STOCK, rel))


covers = {}   # published path -> source path (relative to the repo root)
def cover(rel, base=STOCK):
    src = os.path.join(base, rel)
    if not os.path.exists(src):
        return None
    pub = "covers/" + os.path.basename(rel)
    covers[pub] = os.path.relpath(src, os.path.dirname(ROOT))
    return pub


pieces = {}
for pid, p in P.items():
    k = p["kind"]
    if k == "teaser":
        pieces[pid] = {"title": TEASER_TITLES.get(pid, pid), "kind": "teaser", "idea": p.get("idea", ""), "caption": p["caption"], "hashtags": p["hashtags"],
                       "cover": cover(p["covers"][0]), "files": p["files"], "ready": all(exists(f) for f in p["files"]), "ad": p.get("ad")}
    elif k == "episodio":
        files = p["files"]["a"] + p["files"].get("b", [])
        x = {"title": "Chau " + WORDS[pid].lower(), "kind": "episodio", "ep": p["ep"], "topic": p["topic"], "word": WORDS[pid], "note": p.get("note", ""),
             "caption": p["caption"], "hashtags": p["hashtags"], "cover": cover(p["covers"]["a"][0]), "files": files, "ready": all(exists(f) for f in files)}
        if "b" in p["covers"]:
            x["coverB"] = cover(p["covers"]["b"][0])
        if p.get("ad"):
            x["ad"] = p["ad"]
        if p.get("stories"):
            x["stories"] = [dict(s, ready=exists(s["file"])) for s in p["stories"]]
        pieces[pid] = x
    elif k == "marca":
        pieces[pid] = {"title": "El reel de marca (16:9)", "kind": "marca", "note": p.get("note", ""), "caption": p["caption"], "hashtags": p["hashtags"],
                       "cover": cover(p["covers"][0]), "files": p["files"], "ready": all(exists(f) for f in p["files"])}
    elif k == "motion":
        pieces[pid] = {"title": p["title"], "kind": "motion", "idea": p.get("idea", ""), "caption": p["caption"], "hashtags": p["hashtags"],
                       "cover": cover(p["covers"][0]), "files": p["files"], "ready": all(exists(f) for f in p["files"])}
    elif k == "trailer":
        hype = p["files"]["hype"]
        pieces[pid] = {"title": "El tráiler «Muy pronto» (30 s)", "kind": "trailer", "note": "La versión que cierra el pre-lanzamiento. La de «Ya está disponible» abre la semana de lanzamiento.",
                       "caption": p["caption_hype"], "hashtags": p["hashtags"], "cover": cover(p["covers"]["hype"][0]), "files": hype + p["files"]["launch"],
                       "ready": all(exists(f) for f in hype), "adTrailer": p["ad"], "launchFiles": p["files"]["launch"]}
for pid, x in EXTRA.items():
    x = dict(x)
    x.setdefault("files", [])
    pieces[pid] = x

# 3 Reels a week (Mon / Wed / Fri, 19:30 suggested) + a motion piece on Sunday from week 2, Stories every day
WEEKS = [
    ["teaser-01-el-punto", "teaser-02-la-g", "teaser-03-el-mapa"],
    ["teaser-04-chau", "ep01-chau-planilla", "ep02-chau-notas-del-celu", "gize-logo-en-todo"],
    ["ep03-chau-3-apps", "ep04-chau-descanso-eterno", "ep05-chau-papelito", "gize-motion-reel-20s"],
    ["ep06-chau-post-its", "ep07-chau-a-ojo", "ep08-chau-40-chats", "gize-ui-en-movimiento"],
    ["trailer-30s", "real-01", "real-02"],
]
plan = []
for w, ids in enumerate(WEEKS):
    reels = [{"day": d, "piece": pid} for d, pid in zip((0, 2, 4, 6), ids)]
    stories = []
    for r in reels:
        pc = pieces[r["piece"]]
        if pc.get("stories"):
            for k, s in enumerate(pc["stories"]):
                stories.append({"day": r["day"] + k, "piece": r["piece"], "cut": k})
        else:
            stories.append({"day": r["day"], "piece": r["piece"], "cut": -1})
    plan.append({"week": w + 1, "reels": reels, "stories": stories})

LAUNCH_DIR = "06-lanzamiento-finales"
launch = [{"piece": pid, "files": [f.replace("02-episodios/", LAUNCH_DIR + "/").replace("04-muy-pronto/", LAUNCH_DIR + "/").replace(pid, pid + "_ya-disponible") for f in pieces[pid]["files"]]}
          for pid in pieces if pieces[pid]["kind"] in ("episodio", "marca")]
for l in launch:
    l["ready"] = all(exists(f) for f in l["files"])
OV = os.path.join(STOCK, "07-overlays")
overlays = sorted(f[:-10] for f in os.listdir(OV) if f.endswith("_verde.mp4")) if os.path.isdir(OV) else []
tr = P.get("trailer-30s")
data = {"pieces": pieces, "plan": plan, "launch": launch, "overlays": overlays,
        "launchTrailerReady": bool(tr) and all(exists(f) for f in tr["files"]["launch"])}
tpl = open(os.path.join(HERE, "template.html"), encoding="utf-8").read()
html = tpl.replace("/*__DATA__*/null", json.dumps(data, ensure_ascii=False))
open(os.path.join(HERE, "calendario.html"), "w", encoding="utf-8").write(html)
json.dump(covers, open(os.path.join(HERE, "covers.json"), "w"), indent=1)
print(f"calendario.html: {len(pieces)} pieces, {len(covers)} covers, ready: {sum(1 for p in pieces.values() if p.get('ready'))}")

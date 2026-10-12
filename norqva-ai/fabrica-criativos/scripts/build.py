#!/usr/bin/env python3
"""Build do pacote: transcreve takes (SERIAL), aplica chroma key multipass nos green
screens e gera os JSONs de timeline pro Remotion.

Uso: python3 build.py <pasta-do-pacote>
Espera: <pasta>/script.json, <pasta>/takes/*.mp4, <pasta>/edit/ (copiado do edit-template).
Gera em <pasta>/edit/public/: timeline.json, ctas.json, hooks_timeline.json, takes/, takes_raw/.
"""
import json, os, shutil, subprocess, sys

folder = sys.argv[1].rstrip("/")
HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(f"{folder}/script.json"))
pub = f"{folder}/edit/public"
os.makedirs(f"{pub}/takes", exist_ok=True)
os.makedirs(f"{pub}/takes_raw", exist_ok=True)


# python com backend de transcrição: WHISPER_PYTHON se setado (ex.: venv dedicado),
# senão o mesmo interpretador (onde o install.sh instala faster-whisper).
WHISPER_PY = os.environ.get("WHISPER_PYTHON", sys.executable)

# idioma das legendas = idioma do ad (script.json meta.idioma / meta.lang). Mapa pt-BR → pt.
_LANG_RAW = (S.get("meta", {}).get("idioma") or S.get("meta", {}).get("lang") or "").lower()
LANG = {"pt-br": "pt", "português": "pt", "portugues": "pt", "en-us": "en", "inglês": "en",
        "ingles": "en", "es": "es", "espanhol": "es"}.get(_LANG_RAW, _LANG_RAW[:2] or None)


def transcribe(src, cache):
    if os.path.exists(cache):
        return json.load(open(cache))
    cmd = [WHISPER_PY, f"{HERE}/transcribe.py", src]
    if LANG:
        cmd += ["--lang", LANG]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(res.stdout.strip().splitlines()[-1])
    json.dump(data, open(cache, "w"))
    return data


def duration_of(src):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", src], capture_output=True, text=True).stdout.strip())


def key_multipass(src, dst):
    """Chroma key multipass: amostra tons de verde no MEIO do vídeo (nunca frame 1 — fade
    escuro), 8 pontos × 2 frames, 1 passe de colorkey por tom quantizado + despill.
    Se sobrar resíduo, ver receita de bordas em references/04-qc.md."""
    from PIL import Image
    dur = duration_of(src)
    colors = set()
    for ts in [dur * 0.3, dur * 0.7]:
        subprocess.run(["ffmpeg", "-y", "-ss", str(ts), "-i", src, "-frames:v", "1", "/tmp/_gs.png",
                        "-loglevel", "error"], check=True)
        im = Image.open("/tmp/_gs.png").convert("RGB")
        w, h = im.size
        for p in [(20, 20), (w - 20, 20), (20, h // 2), (w - 20, h // 2), (w // 2, 14),
                  (int(w * 0.12), int(h * 0.25)), (int(w * 0.88), int(h * 0.25)), (20, h - 20)]:
            r, g, b = im.getpixel(p)
            if g > max(r, b) + 15:
                colors.add((r // 12 * 12, g // 12 * 12, b // 12 * 12))
    if not colors:
        # fundo dessaturado passou do filtro de verde → amostrar bordas direto
        pts = [(x, 8) for x in range(8, w, 60)] + \
              [(8, y) for y in range(8, int(h * 0.75), 60)] + \
              [(w - 8, y) for y in range(8, int(h * 0.75), 60)]
        for p in pts:
            r, g, b = im.getpixel(p)
            colors.add((r // 14 * 14, g // 14 * 14, b // 14 * 14))
    chain = ",".join(f"colorkey=0x{r:02x}{g:02x}{b:02x}:0.08:0.02" for r, g, b in colors)
    subprocess.run(["ffmpeg", "-y", "-i", src, "-vf", f"{chain},despill=type=green",
                    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
                    "-c:a", "pcm_s16le", dst, "-loglevel", "error"], check=True)
    print(f"  keyed {os.path.basename(dst)} ({len(colors)} passes)")


def clip_of(l):
    src = f"{folder}/takes/{l['id']}.mp4"
    if not os.path.exists(src):
        sys.exit(f"MISSING {src}")
    data = transcribe(src, f"{folder}/takes/{l['id']}.words.json")
    words = data["words"]
    dur = duration_of(src)
    ts = max(0.0, words[0]["start"] - 0.30) if words else 0.0
    te = min(dur, words[-1]["end"] + 0.35) if words else dur
    shutil.copy(src, f"{pub}/takes/{l['id']}.mp4")
    print(f"{l['id']}: {len(words)}w | {data['text'].strip()[:70]}")
    return {"id": l["id"], "who": l["who"], "src": f"takes/{l['id']}.mp4",
            "trimStart": round(ts, 3), "trimEnd": round(te, 3), "words": words}


clips, ctas = [], {}
for l in S.get("lines", []):
    c = clip_of(l)
    if l["id"].startswith("cta_"):
        ctas[l["id"]] = c
    else:
        clips.append(c)
json.dump({"clips": clips}, open(f"{pub}/timeline.json", "w"), indent=1)
json.dump(ctas, open(f"{pub}/ctas.json", "w"), indent=1)

hooks = {}
for h in S.get("hooks", []):
    src = f"{folder}/takes/{h['id']}.mp4"
    if not os.path.exists(src):
        sys.exit(f"MISSING {src}")
    data = transcribe(src, f"{folder}/takes/{h['id']}.words.json")
    words = data["words"]
    dur = duration_of(src)
    ts = max(0.0, words[0]["start"] - 0.25) if words else 0.0
    te = min(dur, words[-1]["end"] + 0.30) if words else dur
    ext = "mp4"
    if h.get("greenscreen"):
        ext = "mov"
        dst = f"{pub}/takes/{h['id']}.mov"
        if not os.path.exists(dst):
            key_multipass(src, dst)
        else:
            print(f"  keyed {h['id']}.mov: reuso")
        shutil.copy(src, f"{pub}/takes_raw/{h['id']}.mp4")  # p/ usar só o áudio (Visual Hook)
    else:
        shutil.copy(src, f"{pub}/takes/{h['id']}.mp4")
    hooks[h["id"]] = {"src": f"takes/{h['id']}.{ext}", "who": h["who"],
                      "trimStart": round(ts, 3), "trimEnd": round(te, 3), "words": words}
    print(f"{h['id']}: {len(words)}w | {data['text'].strip()[:70]}")
json.dump(hooks, open(f"{pub}/hooks_timeline.json", "w"), indent=1)

for b in S.get("brolls", []):
    src = f"{folder}/takes/{b['id']}.mp4"
    if os.path.exists(src):
        shutil.copy(src, f"{pub}/takes/{b['id']}.mp4")

print(f"BUILD OK — {len(clips)} clips corpo, {len(ctas)} ctas, {len(hooks)} hooks")
print("⚠️  Agora CONFIRA cada transcrição acima contra o script.json (palavra engolida = regenerar take).")

#!/usr/bin/env python3
"""NORQVA (contrato NORQVA-0053): sem preço, sem pessoa de IA falando, sem troca de gerador para
passar em filtro. Antes de gerar, o script confere o script.json inteiro e para se achar preço
ou fala gerada por IA (lines/hooks).

Gerador de pacote: imagens (nano-banana / nano-banana-edit) e vídeos (kling-3.0 em inglês;
Grok Imagine Video 1.5 pra fala em PT/ES/outros).
Uso: python3 gen.py <pasta-do-pacote> <images|videos|music>

A pasta do pacote precisa conter um script.json (formato: templates/script-exemplo.json).
Sintaxe dos prompts de imagem:
  "TEXT2IMG :: <prompt>"                        → google/nano-banana
  "EDIT ref1 [ref2] :: <prompt>"                → google/nano-banana-edit com as refs como image_urls
Ordem de dependência resolvida sozinha (uma imagem EDIT só roda depois que suas refs existem).
"""
import json, os, random, sys, threading, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kie import create_task as _create_task, poll, download

# KIE rate-limita bursts: 3 criações concorrentes com jitter + retry com backoff
_create_sem = threading.Semaphore(3)

# ── modelo de FALA por idioma ──────────────────────────────────────────────────
# Kling 3.0 só gera áudio confiável em INGLÊS (puxa pro EN em PT/ES/etc).
# Pra qualquer idioma != en, use Grok Imagine Video 1.5 (fala nativa multilíngue, i2v,
# 4,5 cr/s a 720p). meta.idioma manda.
_LANG_RAW = (json.load(open(f"{sys.argv[1]}/script.json")).get("meta", {}).get("idioma")
             or json.load(open(f"{sys.argv[1]}/script.json")).get("meta", {}).get("lang") or "en").lower()
LANG = {"pt-br": "pt", "português": "pt", "portugues": "pt", "en-us": "en", "inglês": "en",
        "ingles": "en", "espanhol": "es"}.get(_LANG_RAW, _LANG_RAW[:2])
USE_GROK = LANG != "en"  # fala em idioma != inglês → Grok Imagine Video 1.5
GROK_MODEL = "grok-imagine-video-1-5-preview"
GROK_RES = "720p"  # 4,5 cr/s (1080p = 8 cr/s)


def create_task(model, inp, tries=5):
    for attempt in range(tries):
        with _create_sem:
            try:
                tid = _create_task(model, inp)
                time.sleep(2 + random.random() * 2)
                return tid
            except Exception as e:
                if attempt == tries - 1:
                    raise
                wait = 30 * (attempt + 1) + random.random() * 15
                print(f"  retry em {wait:.0f}s ({e})", flush=True)
        time.sleep(wait)


folder = sys.argv[1]
phase = sys.argv[2]
S = json.load(open(f"{folder}/script.json"))

# ── TRAVAS NORQVA (antes de gastar crédito) ──────────────────────────────────────
from norqva_guard import find_price, walk_strings

_hits = [(path, hit) for path, txt in walk_strings(S) if (hit := find_price(txt))]
if _hits:
    for path, hit in _hits[:10]:
        print(f"PREÇO em {path}: \"{hit}\"", flush=True)
    sys.exit("Anúncio sem preço (D-0053): tire o preço do script.json antes de gerar.")
if S.get("lines") or S.get("hooks"):
    sys.exit("NORQVA: fala gerada por IA (lines/hooks) não é permitida. Use cenas mudas com texto na tela "
             "e música, ou a voz REAL do Ricardo gravada (ver SKILL.md).")
os.makedirs(f"{folder}/takes", exist_ok=True)
os.makedirs(f"{folder}/refs", exist_ok=True)
URLS_PATH = f"{folder}/refs/urls.json"
urls = json.load(open(URLS_PATH)) if os.path.exists(URLS_PATH) else {}
lock = threading.Lock()


def parse_spec(spec):
    head, prompt = spec.split("::", 1)
    toks = head.split()
    return toks[0], toks[1:], prompt.strip()


# NORQVA: recusa por FILTRO DE CONTEÚDO não troca de gerador. Para e avisa (regra 3 do SKILL.md).
_SENSITIVE = ("sensitive", "flagged", "prohibited", "policy", "violat")


def _image_chain(kind, refs, prompt):
    if kind == "TEXT2IMG":
        model, inp = "google/nano-banana", {"prompt": prompt, "output_format": "png", "image_size": "9:16"}
    else:  # EDIT
        model, inp = "google/nano-banana-edit", {"prompt": prompt, "image_urls": [urls[r] for r in refs],
                                                 "output_format": "png", "image_size": "9:16"}
    try:
        tid = create_task(model, inp)
        return poll(tid)["resultUrls"][0]
    except Exception as e:
        if any(k in str(e).lower() for k in _SENSITIVE):
            raise RuntimeError(f"RECUSA DE CONTEÚDO em {model}: pare e avise o Ricardo (não troque de gerador). {e}")
        raise


def gen_image(name, spec):
    if name in urls:
        print(f"{name}: skip", flush=True)
        return
    try:
        kind, refs, prompt = parse_spec(spec)
        url = _image_chain(kind, refs, prompt)
        download(url, f"{folder}/refs/{name}.png")
        with lock:
            urls[name] = url
            json.dump(urls, open(URLS_PATH, "w"), indent=1)
        print(f"{name}: ok", flush=True)
    except Exception as e:
        print(f"{name}: ERROR {e}", flush=True)


LANG_NAME = {"pt": "Brazilian Portuguese", "es": "Spanish", "en": "English", "fr": "French"}


def gen_speech(id, ref_key, scene, mood, voice, text, duration):
    out = f"{folder}/takes/{id}.mp4"
    if os.path.exists(out):
        print(f"{id}: skip", flush=True)
        return
    try:
        if USE_GROK:
            # Grok Imagine Video 1.5 — fala nativa no idioma-alvo (i2v da cena aprovada).
            # Prompt em inglês; a FALA vai entre aspas no idioma do ad.
            lang = LANG_NAME.get(LANG, LANG)
            prompt = (f"{scene}, {mood}, natural movements, realistic lip sync. She speaks "
                      f"directly to camera in fluent {lang}. She says, in {lang}: \"{text}\". "
                      f"Clean audio, no background music, room tone only. No on-screen text, "
                      f"no subtitles, no captions, no UI elements.")
            if "male voice" in voice or voice.startswith("a male") or " he " in f" {voice} ":
                prompt = prompt.replace("She speaks", "He speaks").replace("She says", "He says")
            tid = create_task(GROK_MODEL, {"prompt": prompt, "image_urls": [urls[ref_key]],
                              "resolution": GROK_RES, "duration": int(duration), "aspect_ratio": "9:16"})
            print(f"{id}: grok taskId={tid}", flush=True)
            r = poll(tid, interval=15, timeout=1800)
            download(r["resultUrls"][0], out)
        else:
            # Kling 3.0 — só confiável em inglês
            prompt = (f"{scene}, {mood}, natural movements. She speaks in {voice}. "
                      f'She says: "{text}". No background music, clean room tone only. '
                      f"No on-screen text, no captions, no UI elements, no recording indicators.")
            if "male voice" in voice or voice.startswith("a male") or " he " in f" {voice} ":
                prompt = prompt.replace("She speaks", "He speaks").replace("She says", "He says")
            tid = create_task("kling-3.0/video", {"prompt": prompt, "image_urls": [urls[ref_key]],
                              "sound": True, "duration": str(duration), "mode": "std", "multi_shots": False})
            print(f"{id}: taskId={tid}", flush=True)
            r = poll(tid, interval=20, timeout=1800)
            download(r["resultUrls"][0], out)
        print(f"{id}: saved", flush=True)
    except Exception as e:
        print(f"{id}: ERROR {e}", flush=True)


def gen_broll(b):
    out = f"{folder}/takes/{b['id']}.mp4"
    if os.path.exists(out):
        print(f"{b['id']}: skip", flush=True)
        return
    try:
        # kling-3.0/video é i2v: SEMPRE exige image_urls (t2v puro falha com
        # "image-to-video requires 1 or 2 image_urls"). Se o broll não tem `ref`, gera o
        # PRIMEIRO FRAME com nano-banana (de b['first_frame'] ou do próprio prompt) e usa i2v.
        if b.get("ref"):
            img_url = urls[b["ref"]]
        else:
            fp = b.get("first_frame") or b["prompt"]
            itid = create_task("google/nano-banana",
                               {"prompt": fp, "output_format": "png", "image_size": "9:16"})
            img_url = poll(itid)["resultUrls"][0]
            print(f"{b['id']}: frame-ref auto-gerado", flush=True)
        inp = {"prompt": b["prompt"] + ". No on-screen text, no captions, no UI elements.",
               "sound": False, "duration": str(b["duration"]),
               "mode": "std", "multi_shots": False, "image_urls": [img_url]}
        tid = create_task("kling-3.0/video", inp)
        print(f"{b['id']}: taskId={tid}", flush=True)
        r = poll(tid, interval=20, timeout=1800)
        download(r["resultUrls"][0], out)
        print(f"{b['id']}: saved", flush=True)
    except Exception as e:
        print(f"{b['id']}: ERROR {e}", flush=True)


def run_threads(ts):
    for t in ts: t.start()
    for t in ts: t.join()


if phase == "images":
    # resolve dependências por ondas: roda tudo que já tem as refs prontas, repete
    pend = dict(S["images"])
    for name in list(pend):
        if name in urls:
            pend.pop(name)
    guard = 0
    while pend and guard < 10:
        guard += 1
        ready = []
        for name, spec in pend.items():
            kind, refs, _ = parse_spec(spec)
            if kind == "TEXT2IMG" or all(r in urls for r in refs):
                ready.append(name)
        if not ready:
            sys.exit(f"deadlock de refs: {list(pend)} — confira os nomes das refs no script.json")
        run_threads([threading.Thread(target=gen_image, args=(n, pend[n])) for n in ready])
        for n in ready:
            pend.pop(n)
elif phase == "videos":
    ts = [threading.Thread(target=gen_broll, args=(b,)) for b in S.get("brolls", [])]
    for l in S.get("lines", []):
        who = l["who"]
        ts.append(threading.Thread(target=gen_speech, args=(
            l["id"], who, S["scenes"][who], l["mood"], S["voices"][who], l["text"], l["duration"])))
    for h in S.get("hooks", []):
        ts.append(threading.Thread(target=gen_speech, args=(
            h["id"], h["who"], h["scene"], h["mood"], h["voice"], h["text"], h.get("duration", 6))))
    run_threads(ts)
elif phase == "music":
    # NORQVA: trilha instrumental (Suno via KIE) para os anúncios mudos. Endpoint próprio (não é /jobs).
    out = f"{folder}/music.mp3"
    if os.path.exists(out):
        print("music: skip", flush=True)
    else:
        from kie import API_KEY
        import urllib.request
        mp = (S.get("mudo") or {}).get("music_prompt") or "warm italian acoustic guitar and mandolin, cozy kitchen, instrumental"
        body = json.dumps({"prompt": mp, "instrumental": True, "customMode": False, "model": "V4",
                           "callBackUrl": "https://example.com/cb"}).encode()
        hdr = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
        req = urllib.request.Request("https://api.kie.ai/api/v1/generate", data=body, headers=hdr, method="POST")
        res = json.loads(urllib.request.urlopen(req).read())
        if res.get("code") != 200:
            sys.exit(f"música: KIE recusou ({res})")
        tid = res["data"]["taskId"]
        print(f"music: taskId={tid}", flush=True)
        for _ in range(120):
            time.sleep(10)
            q = urllib.request.Request(f"https://api.kie.ai/api/v1/generate/record-info?taskId={tid}",
                                       headers={"Authorization": f"Bearer {API_KEY}"})
            d = json.loads(urllib.request.urlopen(q).read()).get("data") or {}
            if d.get("status") == "SUCCESS":
                tracks = ((d.get("response") or {}).get("sunoData") or d.get("sunoData") or [])
                urls_ = [t.get("audioUrl") or t.get("audio_url") for t in tracks if t]
                urls_ = [u for u in urls_ if u]
                if not urls_:
                    sys.exit(f"música: sem audioUrl na resposta ({d})")
                for i, u in enumerate(urls_[:2]):
                    download(u, out if i == 0 else f"{folder}/music_alt.mp3")
                print("music: saved (music.mp3 + music_alt.mp3, ouça e escolha)", flush=True)
                break
            if str(d.get("status", "")).upper().endswith("FAILED") or d.get("errorMessage"):
                sys.exit(f"música falhou: {d.get('errorMessage') or d.get('status')}")
        else:
            sys.exit("música: tempo esgotado")
else:
    sys.exit(f"fase desconhecida: {phase} (use images|videos|music)")
print(f"{folder} {phase.upper()} DONE")

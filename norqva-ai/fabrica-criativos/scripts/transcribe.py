#!/usr/bin/env python3
"""Transcrição com word timestamps, multi-backend (roda em qualquer máquina).
Ordem de preferência: mlx-whisper (Mac Apple Silicon) → faster-whisper (qualquer OS).
Saída: JSON {"text": ..., "words": [{"word","start","end"}]} no stdout.

Uso:
  python3 transcribe.py <arquivo.mp4>            → autodetecta o idioma do áudio
  python3 transcribe.py <arquivo.mp4> --lang pt  → força o idioma (pt, en, es, …)
  python3 transcribe.py --check                  → informa qual backend está disponível

⚠️ SEMPRE chame um arquivo por vez (serial). Transcrição paralela satura RAM/GPU.
⚠️ Idioma: por padrão AUTODETECTA. Passe --lang pra travar (as legendas têm que sair no
   idioma do ad — nunca deixe o Whisper traduzir pro inglês num nicho PT/ES).
Se você tem o whisper num venv dedicado, aponte WHISPER_PYTHON pra ele (o build.py usa).

Modelo/dispositivo (portabilidade — a razão nº1 de falha em máquina fria é o large-v3
estourar VRAM/RAM):
  WHISPER_MODEL   (default "base")  — base|small|medium|large-v3. base roda em QUALQUER PC.
  WHISPER_DEVICE  (default "cpu")   — cpu|cuda|auto. cpu+int8 nunca dá CUDA OOM.
  Tem GPU boa? WHISPER_MODEL=large-v3 WHISPER_DEVICE=cuda. GPU pequena estourou? mantém o
  default. O faster-whisper ainda cai pra cpu sozinho se a cuda falhar.
"""
import json, os, sys, tempfile

# ── TRAVA DURA: UMA transcrição por vez na máquina inteira ──────────────────────
# Transcrição paralela satura RAM/GPU e TRAVA o PC de quem usa. Mesmo que algo lá em
# cima dispare duas ao mesmo tempo, a 2ª ESPERA a 1ª terminar (lock exclusivo de arquivo).
# fcntl existe em Mac/Linux/WSL (o alvo). No Windows nativo degrada sem travar — mas o
# build.py já chama serial, então na prática nunca roda simultâneo mesmo assim.
_LOCK_FILE = None
def acquire_serial_lock():
    global _LOCK_FILE
    try:
        import fcntl
        _LOCK_FILE = open(os.path.join(tempfile.gettempdir(), "criativos_infinitos_whisper.lock"), "w")
        fcntl.flock(_LOCK_FILE, fcntl.LOCK_EX)  # bloqueia até a outra transcrição liberar
    except Exception:
        pass  # sem fcntl (Windows nativo): segue — a serialização vem do build.py

LANG = None
for i, a in enumerate(sys.argv):
    if a == "--lang" and i + 1 < len(sys.argv):
        LANG = sys.argv[i + 1]

MODEL = os.environ.get("WHISPER_MODEL", "base")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")


def try_mlx(path):
    import mlx_whisper
    # No Mac Apple Silicon o MLX é eficiente: large-v3 roda de boa; mas respeita override.
    repo = {"base": "mlx-community/whisper-base-mlx",
            "small": "mlx-community/whisper-small-mlx",
            "medium": "mlx-community/whisper-medium-mlx"}.get(
            os.environ.get("WHISPER_MODEL", "large-v3"), "mlx-community/whisper-large-v3-mlx")
    kw = {"path_or_hf_repo": repo, "word_timestamps": True}
    if LANG:
        kw["language"] = LANG  # None = autodetect
    r = mlx_whisper.transcribe(path, **kw)
    words = [{"word": w["word"], "start": round(w["start"], 3), "end": round(w["end"], 3)}
             for seg in r["segments"] for w in seg.get("words", [])]
    return {"text": r["text"], "words": words}


def _faster_run(path, model_name, device, compute_type):
    from faster_whisper import WhisperModel
    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, _ = model.transcribe(path, language=LANG, word_timestamps=True)  # None = autodetect
    words, text = [], []
    for seg in segments:
        text.append(seg.text)
        for w in seg.words or []:
            words.append({"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3)})
    return {"text": "".join(text), "words": words}


def try_faster(path):
    # 1ª tentativa: o que o usuário pediu (default base+cpu int8 = nunca dá OOM).
    ct = "int8" if DEVICE == "cpu" else "auto"
    try:
        return _faster_run(path, MODEL, DEVICE, ct)
    except Exception as e:
        # CUDA OOM / driver / VRAM insuficiente → cai pra CPU int8 (sempre roda).
        msg = str(e).lower()
        if DEVICE != "cpu" and ("cuda" in msg or "memory" in msg or "cudnn" in msg or "out of" in msg):
            sys.stderr.write(f"[transcribe] {DEVICE} falhou ({e}); caindo pra cpu/int8\n")
            return _faster_run(path, MODEL, "cpu", "int8")
        raise


BACKENDS = [("mlx-whisper", try_mlx), ("faster-whisper", try_faster)]

if "--check" in sys.argv:
    for name, _ in BACKENDS:
        try:
            __import__(name.replace("-", "_"))
            print(f"backend disponível: {name}")
            sys.exit(0)
        except ImportError:
            continue
    print("NENHUM backend de transcrição. Instale: python3 -m pip install faster-whisper")
    sys.exit(1)

path = sys.argv[1]
acquire_serial_lock()  # se outra transcrição estiver rodando, espera aqui (não martela junto)
last_err = None
for name, fn in BACKENDS:
    try:
        print(json.dumps(fn(path)))
        sys.exit(0)
    except ImportError:
        continue
    except Exception as e:
        last_err = e
        continue
sys.exit(f"transcrição falhou: {last_err or 'nenhum backend instalado (pip install faster-whisper)'}")

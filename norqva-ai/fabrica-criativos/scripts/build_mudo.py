#!/usr/bin/env python3
"""NORQVA (contrato NORQVA-0053): monta os anúncios MUDOS de comida para o Remotion.

Uso: python3 build_mudo.py <pasta-do-pacote>
Espera: <pasta>/script.json com a seção "mudo" (ver templates/script-exemplo.json),
<pasta>/takes/*.mp4 (b-roll), <pasta>/refs/*.png (imagens/páginas), <pasta>/music.mp3 (opcional),
<pasta>/narracao.mp3 (opcional, voz REAL) e <pasta>/edit/ (cópia do templates/edit-template).
Gera <pasta>/edit/public/mudo.json e copia os arquivos usados.

Trava: para se achar preço em qualquer texto (D-0053) ou arquivo faltando.
"""
import json, os, re, shutil, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from norqva_guard import find_price, walk_strings

folder = sys.argv[1].rstrip("/")
S = json.load(open(f"{folder}/script.json"))
M = S.get("mudo")
if not M:
    sys.exit("script.json sem a seção \"mudo\" (ver templates/script-exemplo.json).")

hits = [(p, h) for p, t in walk_strings(M, "mudo") if (h := find_price(t))]
if hits:
    for p, h in hits:
        print(f"PREÇO em {p}: \"{h}\"")
    sys.exit("Anúncio sem preço (D-0053): tire o preço antes de montar.")

ads = M.get("ads") or []
if not ads:
    sys.exit("mudo.ads vazio: defina uma abertura e uma chamada por anúncio.")
ids = [a.get("id", "") for a in ads]
if any(not re.fullmatch(r"[A-Za-z0-9-]+", i) for i in ids) or len(set(ids)) != len(ids):
    sys.exit(f"ids dos anúncios: só letras/números/hífen e sem repetir ({ids}).")
ctas = [str(a.get("cta", {}).get("text", "")).strip().lower() for a in ads]
if len(set(ctas)) != len(ctas):
    sys.exit("Chamada final repetida entre anúncios: cada anúncio tem a sua.")

pub = f"{folder}/edit/public"
os.makedirs(pub, exist_ok=True)


def duration_of(src):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src],
                         capture_output=True, text=True).stdout.strip()
    return float(out) if out else 0.0


def use(src, seconds=None):
    """Copia o arquivo da pasta do pacote para public/ (mesmo caminho relativo)."""
    full = f"{folder}/{src}"
    if not os.path.exists(full):
        sys.exit(f"FALTA {full}")
    if seconds and src.lower().endswith(".mp4"):
        d = duration_of(full)
        if d and seconds > d + 0.05:
            sys.exit(f"{src} tem {d:.1f}s, mas a cena pede {seconds}s: diminua a cena ou gere b-roll maior.")
    os.makedirs(os.path.dirname(f"{pub}/{src}") or pub, exist_ok=True)
    shutil.copy(full, f"{pub}/{src}")


for sc in M.get("body", []):
    use(sc["src"], sc.get("seconds"))
for a in ads:
    use(a["abertura"]["src"], a["abertura"].get("seconds"))
for key in ("music", "narration"):
    if M.get(key):
        use(M[key])

json.dump(M, open(f"{pub}/mudo.json", "w"), indent=1, ensure_ascii=False)
total = sum(s["seconds"] for s in M.get("body", []))
print(f"BUILD MUDO OK — {len(ads)} anúncios, corpo de {total:.1f}s + abertura + chamada")
print("Agora: cd edit && npx remotion render src/index.ts <Id> ../out/<Id>.mp4 --timeout=120000")

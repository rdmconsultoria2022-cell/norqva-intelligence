#!/usr/bin/env python3
"""Raspagem da Biblioteca de Anúncios (Playwright Python) — DUAS VIAS.
Uso: python3 scrape.py --url "<ads library url>" --name <slug> [--domain <filtro>] [--outdir <pasta>]
Requer: python3 -m pip install playwright && python3 -m playwright install chromium

⚠️ O Facebook migrou os dados dos anúncios do GraphQL (resposta XHR interceptável) pra JSON
EMBUTIDO no HTML da página (scripts data-sjs). Este scraper cobre AS DUAS vias e não depende
do transporte: (1) intercepta respostas graphql SE ainda vierem; (2) raspa o JSON embutido
do DOM a cada scroll. A função harvest() acha o objeto do anúncio (snapshot com videos/
images) onde quer que ele esteja — snake_case OU camelCase. Se o FB mudar de novo o
transporte mas mantiver a forma do objeto, continua funcionando.
"""
import argparse, json, os, re, time

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", required=True)
ap.add_argument("--name", default="ads")
ap.add_argument("--domain", default="")
ap.add_argument("--outdir", default="./ads")
ap.add_argument("--scrolls", type=int, default=25)
ap.add_argument("--per-type", type=int, default=12,
                help="quantos criativos ÚNICOS por mídia (vídeo E imagem). Se um tipo tiver menos, pega o que tem.")
args = ap.parse_args()
os.makedirs(args.outdir, exist_ok=True)

ads, seen = [], set()


def harvest(obj):
    if isinstance(obj, list):
        for v in obj:
            harvest(v)
        return
    if not isinstance(obj, dict):
        return
    aid_raw = obj.get("ad_archive_id") or obj.get("adArchiveID")
    if aid_raw and obj.get("snapshot"):
        s = obj.get("snapshot") or {}
        vids = [v.get("video_hd_url") or v.get("video_sd_url")
                or v.get("videoHdUrl") or v.get("videoSdUrl") for v in (s.get("videos") or [])]
        imgs = [i.get("original_image_url") or i.get("resized_image_url")
                or i.get("originalImageUrl") or i.get("resizedImageUrl") for i in (s.get("images") or [])]
        aid = str(aid_raw)
        if aid not in seen:
            seen.add(aid)
            body = s.get("body") or {}
            cards = s.get("cards") or [{}]
            ads.append({
                "id": aid,
                "page_name": s.get("page_name") or obj.get("page_name") or "",
                "page_id": obj.get("page_id") or s.get("page_id") or "",
                "start": obj.get("start_date") or obj.get("startDate"),
                "active": obj.get("is_active"),
                "collation_count": obj.get("collation_count") or obj.get("collationCount"),
                "cta": s.get("cta_text") or "",
                "link": s.get("link_url") or "",
                "title": s.get("title") or (cards[0].get("title") if cards else "") or "",
                "body": str(body.get("text") or (body.get("markup") or {}).get("__html")
                            or (cards[0].get("body") if cards else "") or "")[:800],
                "videos": [v for v in vids if v],
                "images": [i for i in imgs if i][:3],
            })
    for v in obj.values():
        try:
            harvest(v)
        except Exception:
            pass


def on_response(r):
    # Via 1 (legado): resposta graphql, SE ainda vier. Não é mais garantido.
    if "graphql" not in r.url:
        return
    try:
        txt = r.text()
    except Exception:
        return
    for chunk in re.split(r"\r?\n(?=\{)", txt):
        try:
            harvest(json.loads(chunk))
        except Exception:
            pass


_SCRIPT_JSON = re.compile(
    r'<script[^>]*type="application/json"[^>]*>(.*?)</script>', re.S)


def harvest_html(html):
    """Via 2 (atual): JSON embutido no DOM (scripts data-sjs). Cada bloco
    application/json é a store do Relay hidratada — harvest() acha os anúncios dentro."""
    for m in _SCRIPT_JSON.finditer(html or ""):
        raw = m.group(1)
        try:
            harvest(json.loads(raw))
        except Exception:
            # blocos gigantes às vezes têm HTML-escapes; tenta desescapar o básico
            try:
                harvest(json.loads(raw.replace("&quot;", '"').replace("&#x2F;", "/")))
            except Exception:
                pass


with sync_playwright() as p:
    try:
        browser = p.chromium.launch(headless=False, channel="chrome",
                                    args=["--disable-blink-features=AutomationControlled"])
    except Exception:
        browser = p.chromium.launch(headless=False,
                                    args=["--disable-blink-features=AutomationControlled"])
    ctx = browser.new_context(viewport={"width": 1280, "height": 1600}, locale="en-US",
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
    page = ctx.new_page()
    page.on("response", on_response)
    page.goto(args.url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(4000)
    for label in ["Allow all cookies", "Allow all", "Accept all"]:
        try:
            page.get_by_role("button", name=label).first.click(timeout=1500)
            break
        except Exception:
            pass
    page.wait_for_timeout(2500)
    harvest_html(page.content())  # primeira leva (a página já vem hidratada com o topo)
    for i in range(args.scrolls):
        page.mouse.wheel(0, 2400)
        page.wait_for_timeout(1100)
        if i % 3 == 0:  # DOM é virtualizado: colhe durante o scroll pra não perder cards
            harvest_html(page.content())
    page.wait_for_timeout(3000)
    harvest_html(page.content())
    browser.close()

mine = [a for a in ads if not args.domain
        or re.search(args.domain, a["link"], re.I) or re.search(args.domain, a["page_name"], re.I)]

# ── classifica mídia + dedup por CRIATIVO único + seleção balanceada top-N ──
# Critério: a busca vem ordenada por total_impressions desc, então a ORDEM de captura é o
# ranking de winners. Deduplica pelo arquivo do criativo (o mesmo vídeo aparece em dezenas
# de ads), preservando a 1ª aparição (= maior impressão) e o maior collation_count.
def creative_key(a):
    if a["videos"]:
        return "v:" + a["videos"][0].split("?")[0].split("/")[-1]
    if a["images"]:
        return "i:" + a["images"][0].split("?")[0].split("/")[-1]
    return "n:" + a["id"]

for a in mine:
    a["media"] = "video" if a["videos"] else ("image" if a["images"] else "none")

seen_k, order = {}, []
for a in mine:
    k = creative_key(a)
    if k not in seen_k:
        seen_k[k] = a; order.append(k)
    elif (a.get("collation_count") or 0) > (seen_k[k].get("collation_count") or 0):
        seen_k[k]["collation_count"] = a.get("collation_count")  # mantém posição, sobe a força
deduped = [seen_k[k] for k in order]

N = args.per_type
vids = [a for a in deduped if a["media"] == "video"]
imgs = [a for a in deduped if a["media"] == "image"]
sel = vids[:N] + imgs[:N]  # top-N de CADA (balanceado); se um tipo tem menos, leva o que há

json.dump(ads, open(f"{args.outdir}/{args.name}-raw.json", "w"), indent=2)          # tudo cru
json.dump(sel, open(f"{args.outdir}/{args.name}.json", "w"), indent=2)              # a SELEÇÃO
print(f"TOTAL bruto {len(ads)} | domínio/pool {len(mine)} | criativos únicos {len(deduped)}")
print(f"SELEÇÃO (--per-type {N}): VÍDEO {min(N,len(vids))}/{len(vids)} · IMAGEM {min(N,len(imgs))}/{len(imgs)}")
for m, arr in (("VÍDEO", vids), ("IMAGEM", imgs)):
    if not arr:
        print(f"⚠️ {m}: 0 encontrados — o nicho pode ser 100% do outro formato. Siga com o que tem.")
    elif len(arr) < N:
        print(f"⚠️ {m}: só {len(arr)} (< {N}). Pegou tudo; se quiser mais, aumente --scrolls.")

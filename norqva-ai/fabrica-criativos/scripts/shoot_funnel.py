#!/usr/bin/env python3
"""Screenshots mobile do funil do usuário (viram end cards no Remotion).
Uso: python3 shoot_funnel.py --url "https://..." [--outdir <pacote>/funnel]

Por padrão captura a landing. Para telas internas (resultado de quiz, plano etc.),
adicione passos no bloco PASSOS EXTRAS — padrão comum: setar estado no localStorage
e navegar por JS. Regra: SEMPRE leia a tela antes de interagir.
"""
import argparse, os

from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", required=True)
ap.add_argument("--outdir", default="./funnel")
args = ap.parse_args()
os.makedirs(args.outdir, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    # viewport mobile + device_scale_factor 3 = screenshot nítido dentro do 1080×1920
    page = browser.new_page(viewport={"width": 390, "height": 760}, device_scale_factor=3)
    page.goto(args.url, wait_until="networkidle")
    page.evaluate("() => { try { localStorage.clear(); } catch (e) {} }")
    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{args.outdir}/landing.png")
    print("landing.png ok")

    # ── PASSOS EXTRAS (edite conforme o funil) ────────────────────────────────
    # Exemplo (quiz SPA que expõe go(n)/SCREENS):
    # idx = page.evaluate("() => SCREENS.findIndex(s => s.type === 'diagnosis')")
    # page.evaluate("(i) => go(i)", idx)
    # page.wait_for_timeout(2000)
    # page.screenshot(path=f"{args.outdir}/resultado.png")
    # ──────────────────────────────────────────────────────────────────────────

    browser.close()
print("shots ok →", args.outdir)

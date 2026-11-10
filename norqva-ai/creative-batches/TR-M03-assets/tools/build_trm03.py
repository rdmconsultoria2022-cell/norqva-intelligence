# -*- coding: utf-8 -*-
"""TR-M03: 3 vídeos narrados novos (massa fresca, lasanha, pizza) para renovar a TR-M01 (11/2026), para a campanha de vendas do kit (/kit/OFF-000010).
Mesma linguagem do H02 (prato de perto + páginas reais do PDF no celular + 5 capas + "Toque em Saiba mais"),
mudando só a abertura. Sem preço (D-0053). Usa o motor de build_trm01.py (versão --pagina, C2).

Uso: python3 build_trm02.py <saida_dir> [CHAVE ...]
Gera <CHAVE>-base.mp4 (vídeo com a trilha original) e <CHAVE>-feed.jpg. A narração e as legendas entram depois
(narrar_trm02.py).
"""
import os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
ONLY = sys.argv[2:]
sys.path.insert(0, os.path.join(HERE, "..", "..", "TR-M01-assets", "tools"))
sys.argv = [sys.argv[0], OUT, "--pagina"]
import build_trm01 as m  # noqa: E402

d, photo, covers, FINAL, pdf_scene, dish = m.doc, m.photo, m.covers, m.FINAL, m.pdf_scene, m.dish


def videos():
    return {
        # H08: massa fresca à mão, sem máquina
        "TR-M03-H08-M1-C3": [
            photo(2.4, dish("trattoria", "04_tagliatelle.jpg"), "Massa fresca à mão", "sem máquina"),
            pdf_scene(5.6, "trat", [6, 7], lambda dc: [
                (0.0, dc.view(0)), (1.1, dc.view(0)),
                (1.8, dc.view(1, fy=0.215, fx=0.235, zoom=2.5)), (3.4, dc.view(1, fy=0.25, fx=0.235, zoom=2.5)),
                (4.2, dc.view(1, fy=0.215, fx=0.685, zoom=2.0)), (5.6, dc.view(1, fy=0.27, fx=0.685, zoom=2.0))],
                "Passo a passo com medidas exatas", "Trattoria em Casa · em PDF"),
            photo(2.2, dish("trattoria", "15_ravioli.jpg"), "Ravioli de ricota", "no mesmo livro"),
            covers(2.2, "5 livros de receitas", "massas, doces, pães, antipasti e risotos"),
            dict(FINAL, dur=2.6),
        ],
        # H09: lasanha de domingo
        "TR-M03-H09-M1-C3": [
            photo(2.6, dish("trattoria", "17_lasanha.jpg"), "Lasanha alla bolognese", "a de domingo, do jeito italiano"),
            pdf_scene(5.4, "trat", [40, 41], lambda dc: [
                (0.0, dc.view(0)), (1.1, dc.view(0)),
                (1.8, dc.view(1, fy=0.215, fx=0.235, zoom=2.5)), (3.3, dc.view(1, fy=0.25, fx=0.235, zoom=2.5)),
                (4.0, dc.view(1, fy=0.215, fx=0.685, zoom=2.0)), (5.4, dc.view(1, fy=0.27, fx=0.685, zoom=2.0))],
                "Montagem passo a passo", "Trattoria em Casa · em PDF"),
            photo(2.2, dish("trattoria", "08_ragu.jpg"), "Ragù alla bolognese", "receita completa no livro"),
            covers(2.2, "E mais 4 livros no kit", "doces, pães, antipasti e risotos"),
            dict(FINAL, dur=2.6),
        ],
        # H10: pizza de fermentação lenta
        "TR-M03-H10-M1-C3": [
            photo(2.6, dish("trattoria", "26_pizza.jpg"), "Pizza de fermentação lenta", "feita em casa"),
            pdf_scene(5.4, "trat", [60, 61], lambda dc: [
                (0.0, dc.view(0)), (1.1, dc.view(0)),
                (1.8, dc.view(1, fy=0.215, fx=0.235, zoom=2.5)), (3.3, dc.view(1, fy=0.25, fx=0.235, zoom=2.5)),
                (4.0, dc.view(1, fy=0.215, fx=0.685, zoom=2.0)), (5.4, dc.view(1, fy=0.27, fx=0.685, zoom=2.0))],
                "Medidas exatas e passo a passo", "Trattoria em Casa · em PDF"),
            photo(2.2, dish("trattoria", "27_focaccia.jpg"), "Focaccia com alecrim", "no mesmo livro"),
            covers(2.2, "5 livros de receitas", "74 receitas italianas em PDF"),
            dict(FINAL, dur=2.6),
        ],
    }


FEED = {
    "TR-M03-H08-M1-C3": ("trat", [7], dict(i=0, fy=0.215, fx=0.235, zoom=2.5), "Massa fresca à mão, passo a passo"),
    "TR-M03-H09-M1-C3": ("trat", [40], dict(i=0, fy=0.0, zoom=1.0), "Lasanha de domingo, do jeito italiano"),
    "TR-M03-H10-M1-C3": ("trat", [60], dict(i=0, fy=0.0, zoom=1.0), "Pizza de fermentação lenta em casa"),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    v = videos()
    keys = ONLY or list(v)
    raw = os.path.join(OUT, "_trilha.wav")
    wav = os.path.join(OUT, "_trilha_14lufs.wav")
    subprocess.run([sys.executable, m.MUSIC, str(m.DUR), raw], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-af", "loudnorm=I=-14:TP=-1.5:LRA=7", "-ar", "48000", wav], check=True)
    for k in keys:
        m.FEED[k] = FEED[k]
        m.feed_image(k, os.path.join(OUT, f"{k}-feed.jpg"))
        m.render(k, v[k], os.path.join(OUT, f"{k}-base.mp4"), wav)
        print("ok", k)
    os.remove(raw)
    os.remove(wav)

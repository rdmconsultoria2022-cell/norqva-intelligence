# -*- coding: utf-8 -*-
"""TR-M02: 3 variações do vencedor TR-M01-H02 (sobremesas), para a campanha de vendas do kit (/kit/OFF-000010).
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
        # H05: tiramisù em passos: abre no prato, depois a página da receita com medidas e passos
        "TR-M02-H05-M1-C3": [
            photo(2.6, dish("dolci", "01_tiramisu.jpg"), "Tiramisù da nonna", "receita completa no livro", fx=0.6),
            pdf_scene(6.0, "dolci", [5, 6], lambda dc: [
                (0.0, dc.view(0)), (1.0, dc.view(0)),
                (1.6, dc.view(1, fy=0.215, fx=0.235, zoom=2.5)), (3.2, dc.view(1, fy=0.25, fx=0.235, zoom=2.5)),
                (3.9, dc.view(1, fy=0.215, fx=0.685, zoom=2.0)), (6.0, dc.view(1, fy=0.29, fx=0.685, zoom=2.0))],
                "Medidas exatas e passo a passo", "Dolci della Nonna · em PDF"),
            covers(2.4, "E mais 4 livros no kit", "massas, pães, antipasti e risotos"),
            dict(FINAL, dur=4.0),
        ],
        # H06: sobremesa de domingo sem errar: panna cotta, a página da receita e o budino
        "TR-M02-H06-M1-C3": [
            photo(2.4, dish("dolci", "02_panna_cotta.jpg"), "Panna cotta", "com calda de frutas vermelhas"),
            pdf_scene(5.2, "dolci", [7, 8], lambda dc: [
                (0.0, dc.view(0)), (1.1, dc.view(0)),
                (1.8, dc.view(1, fy=0.215, fx=0.235, zoom=2.5)), (3.4, dc.view(1, fy=0.25, fx=0.235, zoom=2.5)),
                (4.1, dc.view(1, fy=0.215, fx=0.685, zoom=2.0)), (5.2, dc.view(1, fy=0.26, fx=0.685, zoom=2.0))],
                "Sobremesa de domingo sem errar", "gramas, ml e xícaras"),
            photo(2.0, dish("dolci", "09_budino.jpg"), "Budino al cioccolato", "no mesmo livro"),
            covers(2.0, "5 livros de receitas", "doces, massas, pães, antipasti e risotos"),
            dict(FINAL, dur=3.4),
        ],
        # H07: do doce à massa: cannoli, a página do Dolci e a carbonara do Trattoria
        "TR-M02-H07-M1-C3": [
            photo(2.3, dish("dolci", "10_cannoli.jpg"), "Cannoli em taça", "Dolci della Nonna", fx=0.55),
            pdf_scene(2.9, "dolci", [23], lambda dc: [(0.0, dc.view(0)), (2.9, dc.view(0))],
                      "A sobremesa está aqui", "10 doces italianos em PDF"),
            photo(2.3, dish("trattoria", "10_carbonara.jpg"), "E o jantar também", "carbonara, como em Roma"),
            pdf_scene(2.9, "trat", [26], lambda dc: [
                (0.0, dc.view(0, fy=0.055, fx=0.235, zoom=2.5)), (2.9, dc.view(0, fy=0.09, fx=0.235, zoom=2.5))],
                "Carbonara passo a passo", "Trattoria em Casa · em PDF"),
            covers(1.8, "5 livros no kit", "74 receitas em PDF"),
            dict(FINAL, dur=2.8),
        ],
    }


FEED = {
    "TR-M02-H05-M1-C3": ("dolci", [6], dict(i=0, fy=0.215, fx=0.235, zoom=2.5), "Tiramisù com medidas exatas, em PDF"),
    "TR-M02-H06-M1-C3": ("dolci", [7], dict(i=0, fy=0.0, zoom=1.0), "Sobremesa de domingo sem errar"),
    "TR-M02-H07-M1-C3": ("dolci", [23], dict(i=0, fy=0.0, zoom=1.0), "Do doce à massa: 5 livros em PDF"),
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

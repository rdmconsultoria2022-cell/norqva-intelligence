"""Travas NORQVA (contrato NORQVA-0053 / D-0053) usadas pelo gen.py.

Mesmas regras de preço do NORQVA (backend/src/services/creative/priceInCopy.ts). Se mudar lá,
mude aqui também.
"""
import re

_NUM_END = r"(?!\s*[a-zà-úç\d])"
RULES = [
    re.compile(r"R\s?\$\s*\d[\d.,]*\d|R\s?\$\s*\d|\bUS\s?\$\s*\d", re.I),
    re.compile(r"(?<![\dA-Za-z/.,:])\d{1,5}[.,]\d{2}(?!\d|[.,/:]\d|\s?%|\s?(?:kg|mg|g|ml|l|cm|mm|m|°|º)(?![a-zà-ú]))", re.I),
    re.compile(r"\b\d{1,2}\s?x\s?(?:de\s+)?(?:R\s?\$|\d+,\d{2}(?!\d))", re.I),
    re.compile(r"\b\d{1,2}\s?x\s+sem\s+juros\b|\bem\s+at[eé]\s+\d{1,2}\s?(?:x|vezes)(?![a-z])|\bparcel\w*\s+em\s+(?:at[eé]\s+)?\d|\b\d{1,2}\s+vezes\s+(?:sem\s+juros|no\s+cart[aã]o)", re.I),
    re.compile(r"\b\d+\s*(?:real|reais|contos?|pila)\b|\b(?:reais|centavos)\b", re.I),
    re.compile(r"\bpor\s+(?:apenas|somente|s[oó])\s+(?:R\s?\$\s?\d|\d+(?:[.,]\d{2})?" + _NUM_END + r"|um\s+caf[eé])", re.I),
    re.compile(r"\b(?:custa|custando|a\s+partir\s+de|valor\s+de|investimento\s+de|sai\s+por|apenas)\s+(?:R\s?\$\s?\d|\d+(?:[.,]\d{2})?" + _NUM_END + r")", re.I),
    re.compile(r"\bde\s+(?:R\s?\$\s?)?\d+(?:[.,]\d{2})?\s+por\s+(?:R\s?\$\s?)?\d", re.I),
    re.compile(r"(?<![a-zà-ú])pre[cç]os?(?![a-zà-ú])", re.I),
    re.compile(r"\d{1,3}\s?%\s?(?:de\s)?(?:desconto|off)\b|\b(?:desconto|cupom)\s+de\s+\d", re.I),
]


def find_price(text):
    s = str(text or "")
    for r in RULES:
        m = r.search(s)
        if m:
            return m.group(0).strip()
    return None


def walk_strings(obj, path="script"):
    """Todos os textos do script.json (ignora notas que começam com "_")."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            if str(k).startswith("_"):
                continue
            yield from walk_strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj


if __name__ == "__main__":
    P = ["Kit completo por R$ 27,90", "R$27", "Só 19,90 hoje", "Em 4x de 7,48 no cartão", "Menos de trinta reais",
         "Por apenas um café", "Preço especial", "50% de desconto", "por só 27", "em até 12x", "custa 27"]
    N = ["28 receitas italianas", "Pronto em 30 minutos", "1,5 kg de massa", "Forma 20x30 cm", "1,25 kg de farinha",
         "por apenas 3 ingredientes", "a partir de 2 ovos", "100% natural", "linguiça", "12.10.2026", "19:30"]
    bad = [t for t in P if not find_price(t)] + [t for t in N if find_price(t)]
    print("ok" if not bad else f"FALHOU: {bad}")

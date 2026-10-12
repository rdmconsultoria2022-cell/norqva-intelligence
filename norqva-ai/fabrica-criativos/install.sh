#!/usr/bin/env bash
# Instalador — Fábrica de criativos NORQVA (base: Criativos Infinitos v2.2)
# Copia a skill para ~/.claude/skills/, cria um .venv isolado e instala as deps Python
# lá dentro (sem sudo, sem --user → imune ao PEP 668). Deps de SISTEMA (node/ffmpeg) que
# precisam de sudo/brew NÃO são instaladas aqui: o script junta o que falta e te dá UM
# comando pra colar. Seguro rodar mais de uma vez (idempotente).
# Windows: rode dentro do WSL (Ubuntu). Mac: roda direto.
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_SRC="$DIR"  # NORQVA: a pasta norqva-ai/fabrica-criativos já é a skill
SKILL_DST="$HOME/.claude/skills/fabrica-criativos-norqva"
VENV="$SKILL_DST/.venv"
OK=1

say()  { printf "\033[1;36m[fabrica-criativos-norqva]\033[0m %s\n" "$1"; }
fail() { printf "\033[1;31m  ✗ %s\033[0m\n" "$1"; OK=0; }
pass() { printf "\033[1;32m  ✓ %s\033[0m\n" "$1"; }
warn() { printf "\033[1;33m  ! %s\033[0m\n" "$1"; }

case "$(uname -s)" in
  Darwin) OS=mac  ;;
  *)      OS=linux;;
esac

# ── 1) Deps de SISTEMA — só detecta e acumula (NÃO instala: sudo não roda no Claude Code) ──
say "1/5 Checando dependências de sistema…"
MISS_MAC=(); MISS_APT=()
need() { # $1=binário  $2=pacote-brew  $3=pacote-apt
  if command -v "$1" >/dev/null 2>&1; then pass "$1"; else
    fail "$1 ausente"; MISS_MAC+=("$2"); MISS_APT+=("$3"); fi
}
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
  [ "$NODE_MAJOR" -ge 18 ] && pass "node $(node -v)" \
    || { fail "node $(node -v) < 18"; MISS_MAC+=("node"); MISS_APT+=("nodejs npm"); }
else fail "node ausente"; MISS_MAC+=("node"); MISS_APT+=("nodejs npm"); fi
need python3 python "python3 python3-venv python3-pip"
need ffmpeg  ffmpeg ffmpeg   # ffprobe vem junto

if [ "${#MISS_MAC[@]}" -gt 0 ]; then
  echo
  warn "Falta software de sistema. Cole ESTE comando no terminal (uma vez) e rode o install de novo:"
  if [ "$OS" = mac ]; then
    printf "\033[1m    brew install %s\033[0m\n" "$(printf '%s ' "${MISS_MAC[@]}" | xargs)"
  else
    printf "\033[1m    sudo apt update && sudo apt install -y %s\033[0m\n" "$(printf '%s ' "${MISS_APT[@]}" | xargs)"
    warn "(WSL/Linux: a senha do sudo é a senha de login do seu usuário Linux.)"
  fi
  echo
fi

# ── 2) KIE_API_KEY ──
say "2/5 Checando KIE_API_KEY…"
if [ -n "${KIE_API_KEY:-}" ]; then
  if curl -s "https://api.kie.ai/api/v1/chat/credit" -H "Authorization: Bearer $KIE_API_KEY" | grep -q '"code":200'; then
    pass "KIE_API_KEY válida"
  else
    fail "KIE_API_KEY presente mas a API recusou — confira a chave no painel da KIE"
  fi
else
  fail "KIE_API_KEY não definida — export KIE_API_KEY=\"...\" no seu ~/.zshrc ou ~/.bashrc"
fi

# ── 3) Copia a skill (antes do venv, que vive dentro dela) ──
say "3/5 Instalando a skill em ~/.claude/skills/…"
mkdir -p "$HOME/.claude/skills"
rm -rf "$SKILL_DST"
cp -R "$SKILL_SRC" "$SKILL_DST"
mkdir -p "$SKILL_DST/niches"
pass "skill copiada para $SKILL_DST"

# ── 4) .venv isolado + deps Python (sem sudo, sem --user → sem PEP 668) ──
say "4/5 Criando .venv e instalando Python deps (playwright, pillow, faster-whisper)…"
if command -v python3 >/dev/null 2>&1; then
  python3 -m venv "$VENV" 2>/dev/null || warn "python3 -m venv falhou — instale python3-venv (ver comando acima)"
  if [ -x "$VENV/bin/python" ]; then
    PY="$VENV/bin/python"
    "$PY" -m pip install --quiet --upgrade pip >/dev/null 2>&1
    if "$PY" -m pip install --quiet playwright pillow faster-whisper >/dev/null 2>&1; then
      "$PY" -m playwright install chromium >/dev/null 2>&1 \
        && pass "venv + playwright/chromium + faster-whisper prontos" \
        || warn "chromium não baixou — rode: $PY -m playwright install chromium"
    else
      fail "pip no venv falhou — rode: $PY -m pip install playwright pillow faster-whisper"
    fi
  fi
else
  fail "sem python3 — instale primeiro (comando acima) e rode ./install.sh de novo"
fi

# ── 5) Remotion no template (uma vez, pra 1ª renderização não demorar) ──
say "5/5 Instalando dependências do Remotion no template…"
if command -v npm >/dev/null 2>&1 && [ -f "$SKILL_DST/templates/edit-template/package.json" ]; then
  (cd "$SKILL_DST/templates/edit-template" && npm install --silent >/dev/null 2>&1) \
    && pass "remotion pronto" || warn "npm install do Remotion falhou — rode em $SKILL_DST/templates/edit-template"
else
  warn "npm ausente — Remotion instala depois (o template roda npm install no 1º uso)"
fi

echo
say "IMPORTANTE p/ o Claude: use este python nos scripts e no build (não o do sistema):"
printf "\033[1m    export WHISPER_PYTHON=\"%s/bin/python\"\033[0m\n" "$VENV"
printf "    (scrape.py/transcribe.py rodam com %s/bin/python)\n" "$VENV"
echo
if [ "$OK" = "1" ]; then
  say "TUDO PRONTO. Abra o Claude Code e diga: \"Usa a skill fabrica-criativos-norqva: roda o CHECKUP\""
else
  say "Terminou com pendências (✗ acima). Resolva o comando de sistema e rode ./install.sh de novo."
fi

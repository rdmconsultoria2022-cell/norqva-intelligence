# Montagem da vídeo-aula do Kit de Bordado: 21 cenas + desenhos do PDF + legendas + abertura e encerramento.
import json, subprocess, os, re, sys, base64, importlib.util
S = os.path.dirname(os.path.abspath(__file__))
SRC = '/mnt/user-data/uploads/aula'
IMG = '/home/claude/norqva-intelligence/frontend/public/images/bordado'
W, H, FPS = 1080, 1920, 30
os.chdir(S)
spec = importlib.util.spec_from_file_location('ga', f'{S}/gerar_aula.py'); ga = importlib.util.module_from_spec(spec)
sys.argv = ['x']; spec.loader.exec_module(ga)
FALA = {num: fala for num, _t, _c, _m, fala in ga.CENAS}
words = json.load(open('words.json'))

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: raise SystemExit(' '.join(cmd[:6]) + '\n' + r.stderr[-2500:])

# ---------- cartões com os desenhos do PDF (Playwright) ----------
from playwright.sync_api import sync_playwright
def b64(p): return base64.b64encode(open(p, 'rb').read()).decode()
from PIL import Image
p06 = Image.open('p06-06.png'); p34 = Image.open('p34-34.png')
p06.crop((105, 315, 675, 810)).save('d_atras.png')
p06.crop((105, 915, 675, 1395)).save('d_haste.png')
p34.crop((285, 235, 665, 740)).save('d_gato.png')
CARDS = {
    'gato': ('d_gato.png', 'Risco 36 · Gatinho', 'página 34 do kit'),
    'atras': ('d_atras.png', 'Ponto atrás', 'Guia de pontos · página 6'),
    'haste': ('d_haste.png', 'Ponto haste', 'Guia de pontos · página 6'),
}
def card_html(img, title, sub):
    return f'''<html><body style="margin:0;background:transparent"><div id="c" style="width:760px;padding:28px 30px 26px;background:#FBF6EF;border-radius:34px;
box-shadow:0 18px 50px rgba(40,25,10,.35);font-family:Poppins;box-sizing:border-box">
<div style="font-size:24px;font-weight:600;letter-spacing:.22em;color:#B4583A">NO KIT</div>
<div style="display:flex;justify-content:space-between;align-items:baseline;margin:4px 0 16px">
<div style="font-family:'Playfair Display',serif;font-size:46px;color:#2A2420">{title}</div>
<div style="font-size:24px;color:#8A7B70">{sub}</div></div>
<img src="data:image/png;base64,{b64(img)}" style="width:100%;border-radius:18px;background:#fff;display:block"></div></body></html>'''
def title_html():
    return f'''<html><body style="margin:0;background:transparent"><div id="c" style="width:900px;padding:34px 40px;background:rgba(251,246,239,.96);border-radius:36px;
box-shadow:0 18px 50px rgba(40,25,10,.3);font-family:Poppins;text-align:center;box-sizing:border-box">
<div style="font-size:26px;font-weight:600;letter-spacing:.28em;color:#B4583A">AULA PRÁTICA</div>
<div style="font-family:'Playfair Display',serif;font-size:64px;line-height:1.1;color:#2A2420;margin-top:8px">Do risco ao bastidor pronto</div>
<div style="font-size:28px;color:#6E625B;margin-top:10px">Gatinho · Kit de Bordado NORQVA</div></div></body></html>'''
def end_html():
    return f'''<html><body style="margin:0"><div style="width:{W}px;height:{H}px;background:#EFE6DA;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Poppins">
<img src="data:image/jpeg;base64,{b64(IMG + '/colecao.jpg')}" style="width:820px;height:820px;border-radius:40px;object-fit:cover;box-shadow:0 30px 60px rgba(90,62,36,.25)">
<div style="margin-top:70px;font-weight:700;font-size:42px;letter-spacing:.32em;color:#B4583A">NORQVA</div>
<div style="font-family:'Playfair Display',serif;font-size:92px;color:#2A2420;margin-top:10px">Kit de Bordado</div>
<div style="font-size:44px;color:#6E625B;margin-top:14px">50 riscos para iniciantes · PDF</div>
<div style="font-size:30px;color:#8A7B70;margin-top:60px">Agora é a sua vez: borde e mostre pra gente</div></div></body></html>'''
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': W, 'height': H})
    for key, (img, t, s) in CARDS.items():
        pg.set_content(card_html(img, t, s)); pg.wait_for_timeout(400)
        pg.locator('#c').screenshot(path=f'card_{key}.png', omit_background=True)
    pg.set_content(title_html()); pg.wait_for_timeout(400); pg.locator('#c').screenshot(path='card_title.png', omit_background=True)
    pg.set_content(end_html()); pg.wait_for_timeout(500); pg.screenshot(path='endcard.png')
    b.close()

# ---------- cenas ----------
OVER = {'05': 'gato', '11': 'atras', '12': 'atras', '14': 'haste'}
parts = []
for n in [f'{i:02d}' for i in range(1, 22)]:
    ws = words[n]
    start = max(0.0, ws[0][1] - 0.15) if ws else 0.0
    end = min(8.0, (ws[-1][2] + 0.45) if ws else 8.0)
    dur = end - start
    out = f'seg{n}.mp4'
    inputs = ['-ss', f'{start:.2f}', '-t', f'{dur:.2f}', '-i', f'{SRC}/aula_{n}.mp4']
    fc = f'[0:v]scale={W}:{H}:flags=lanczos,fps={FPS},setsar=1[v0]'
    last = 'v0'
    if n in OVER:
        inputs += ['-loop', '1', '-t', f'{dur:.2f}', '-i', f'card_{OVER[n]}.png']
        fc += f";[1:v]format=rgba,fade=t=in:st=0.25:d=0.35:alpha=1[c];[v0][c]overlay=(W-w)/2:150:shortest=1[v1]"; last = 'v1'
    if n == '01':
        inputs += ['-loop', '1', '-t', '3.6', '-i', 'card_title.png']
        fc += f";[1:v]format=rgba,fade=t=out:st=3.0:d=0.5:alpha=1[c];[v0][c]overlay=(W-w)/2:150:eof_action=pass[v1]"; last = 'v1'
    # fade curto entre cenas
    fc += f";[{last}]fade=t=in:st=0:d=0.18,fade=t=out:st={dur-0.18:.2f}:d=0.18[vo];[0:a]aresample=48000,afade=t=in:d=0.08,afade=t=out:st={dur-0.12:.2f}:d=0.12[a]"
    run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', fc, '-map', '[vo]', '-map', '[a]', '-t', f'{dur:.2f}',
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', out])
    parts.append((out, dur, n, start))
END = 3.5
run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', 'endcard.png', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
     '-vf', f'scale={W}:{H},fps={FPS},format=yuv420p,fade=t=in:st=0:d=0.4', '-t', str(END), '-c:v', 'libx264', '-crf', '19', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-shortest', 'endcard.mp4'])
parts.append(('endcard.mp4', END, None, 0))
open('list.txt', 'w').write(''.join(f"file '{p}'\n" for p, *_ in parts))
run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'joined.mp4'])

# ---------- legendas: texto do roteiro, tempo das palavras faladas ----------
def ts(t):
    return f'{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}'
events = []; off = 0.0
for out, dur, n, start in parts:
    if n is None: break
    script = FALA[n].split()
    ws = words[n]
    a0, a1 = ws[0][1] - start, ws[-1][2] - start
    if len(ws) == len(script):
        times = [(w[1] - start, w[2] - start) for w in ws]
    else:  # distribui pelo tamanho das palavras entre o começo e o fim da fala
        tot = sum(len(w) + 1 for w in script); acc = 0; times = []
        for w in script:
            s = a0 + (a1 - a0) * acc / tot; acc += len(w) + 1; times.append((s, a0 + (a1 - a0) * acc / tot))
    i = 0
    while i < len(script):
        grp = [i]; i += 1
        while i < len(script) and len(' '.join(script[j] for j in grp + [i])) <= 34 and not script[grp[-1]].endswith(('.', ',', '?', '!', ':')):
            grp.append(i); i += 1
        st = off + times[grp[0]][0]
        en = off + (times[i][0] if i < len(script) else min(times[grp[-1]][1] + 0.4, dur))
        events.append((st, en, ' '.join(script[j] for j in grp)))
    off += dur
total = sum(d for _, d, *_ in parts)
ass = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Poppins,58,&H00FFFFFF,&H00FFFFFF,&H00302018,&H96000000,-1,0,0,0,100,100,0,0,3,14,0,2,90,90,330,1
Style: AI,Poppins,30,&H30FFFFFF,&H30FFFFFF,&H70000000,&H70000000,0,0,0,0,100,100,0,0,1,2,1,8,40,40,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
for st, en, t in events:
    ass += f"Dialogue: 0,{ts(st)},{ts(en)},Cap,,0,0,0,,{t}\n"
ass += f"Dialogue: 0,{ts(0)},{ts(total - END)},AI,,0,0,0,,Apresentadora e cenas criadas com IA\n"
open('caps.ass', 'w').write(ass)
run(['ffmpeg', '-v', 'error', '-y', '-i', 'joined.mp4', '-vf', 'ass=caps.ass', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11',
     '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'AULA_BORDADO_GATINHO.mp4'])
print('ok', round(total, 1), 's', len(events), 'legendas')

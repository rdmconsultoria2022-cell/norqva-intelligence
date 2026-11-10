import json, os, subprocess, sys, re, unicodedata
S = __import__("os").environ.get("TRM02_WORK", ".")  # pasta com openai_key.txt, m02/ (bases) e m02n/ (saída)
K = open(f"{S}/openai_key.txt").read().strip()
OUT = f"{S}/m03n"
INS = ("Fale em português do Brasil, com sotaque brasileiro natural. Narradora calorosa e acolhedora, ritmo de anúncio curto, "
       "animada sem exagero, como quem convida para a cozinha.")
V = {
  "TR-M03-H08-M1-C3": ("Massa fresca feita à mão, sem máquina. No livro, cada passo vem explicado, com a medida exata. Dá pra fazer tagliatelle, pappardelle e até ravioli. São cinco livros de receitas italianas. Toque em saiba mais.",
                       {"massa","fresca","mão","máquina","passo","medida","exata","ravioli","cinco","livros","saiba","mais"}),
  "TR-M03-H09-M1-C3": ("Lasanha alla bolognese de domingo, do jeito italiano. Ragù, bechamel e a montagem em camadas, tudo passo a passo, com foto do prato. E são mais quatro livros no kit. Toque em saiba mais.",
                       {"lasanha","domingo","ragù","bechamel","camadas","passo","foto","quatro","livros","saiba","mais"}),
  "TR-M03-H10-M1-C3": ("Pizza com massa de fermentação lenta, feita em casa. São vinte e quatro horas de fermentação na geladeira, com cada medida explicada. E tem focaccia com alecrim no mesmo livro. São cinco livros de receitas. Toque em saiba mais.",
                       {"pizza","fermentação","lenta","casa","vinte","quatro","horas","focaccia","alecrim","cinco","livros","saiba","mais"}),
}
def sh(*a): subprocess.run(a, check=True)
def dur(p): return float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",p]).decode())
def norm(w): return unicodedata.normalize("NFC", re.sub(r"[^\wà-ÿ]","",w.lower()))
def t(s): h=int(s//3600); m=int(s%3600//60); return f"{h}:{m:02d}:{s%60:05.2f}"
for key in (sys.argv[1:] or V):
    text, hot = V[key]
    mp3 = f"{OUT}/{key}-voz.mp3"
    if not os.path.exists(mp3):
        json.dump({"model":"gpt-4o-mini-tts","voice":"coral","input":text,"instructions":INS,"response_format":"mp3"}, open(f"{OUT}/b.json","w"))
        sh("curl","-sS","-m","90","https://api.openai.com/v1/audio/speech","-H",f"Authorization: Bearer {K}","-H","Content-Type: application/json","-d",f"@{OUT}/b.json","-o",mp3)
    tj = f"{OUT}/{key}-words.json"
    if not os.path.exists(tj):
        r = subprocess.check_output(["curl","-sS","-m","90","https://api.openai.com/v1/audio/transcriptions","-H",f"Authorization: Bearer {K}",
            "-F",f"file=@{mp3}","-F","model=whisper-1","-F","language=pt","-F","response_format=verbose_json","-F","timestamp_granularities[]=word"])
        open(tj,"wb").write(r)
    words = json.load(open(tj))["words"]
    # legenda usa as palavras do ROTEIRO (grafia certa), com os tempos do whisper alinhados por ordem
    script_words = text.split()
    import difflib
    A=[norm(x) for x in script_words]; B=[norm(x["word"]) for x in words]
    tm=[None]*len(A)
    for op,i1,i2,j1,j2 in difflib.SequenceMatcher(None,A,B,autojunk=False).get_opcodes():
        if op=="equal":
            for k in range(i2-i1): tm[i1+k]=(words[j1+k]["start"],words[j1+k]["end"])
        elif op in("replace",) and j2>j1:
            t0,t1=words[j1]["start"],words[j2-1]["end"]; L=i2-i1
            for k in range(L): tm[i1+k]=(t0+(t1-t0)*k/L, t0+(t1-t0)*(k+1)/L)
    for i in range(len(tm)):
        if tm[i] is None:
            p=tm[i-1] if i>0 and tm[i-1] else (0,0); tm[i]=(p[1],p[1]+0.2)
    TEMPO=1.06
    words=[{"start":a/TEMPO,"end":b/TEMPO} for a,b in tm]
    n=len(script_words)
    lead = 0.35  # a voz entra 0,35 s depois do começo
    ass = ["[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1920","",
           "[V4+ Styles]","Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
           "Style: Cap,Poppins,68,&H00FFFFFF,&H00FFFFFF,&H3A111111,&H3A111111,-1,0,0,0,100,100,0,0,3,14,0,2,80,80,300,1","",
           "[Events]","Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    chunks, cur = [], []
    for i in range(n):
        cur.append(i)
        endp = re.search(r"[.,:!?]$", script_words[i])
        if len(cur) == 3 or endp or i == n-1:
            chunks.append(cur); cur = []
    for ci, c in enumerate(chunks):
        st = words[c[0]]["start"] + lead
        en = words[c[-1]]["end"] + lead + 0.25
        if ci + 1 < len(chunks):
            en = min(en, words[chunks[ci+1][0]]["start"] + lead - 0.02)
        else:
            en = max(en, words[c[-1]]["end"] + lead + 0.9)
        parts = []
        for i in c:
            w = re.sub(r"[.,:]$", "", script_words[i])
            parts.append("{\\c&H00759AB3&}" + w + "{\\c&H00FFFFFF&}" if norm(w) in hot else w)
        ass.append(f"Dialogue: 0,{t(st)},{t(en)},Cap,,0,0,0,,{' '.join(parts)}")
    fast=f"{OUT}/{key}-voz106.wav"
    sh("ffmpeg","-loglevel","error","-y","-i",mp3,"-af","atempo=1.06","-ar","48000",fast)
    d = dur(fast); mp3 = fast
    open(f"{OUT}/{key}.ass","w").write("\n".join(ass)+"\n")
    total = max(15.0, round(d + lead + 0.7, 2))
    base = f"{S}/m03/{key}-base.mp4"
    out = f"{OUT}/{key}.mp4"
    pad = total - 15.0
    sh("ffmpeg","-loglevel","error","-y","-i",base,"-i",mp3,"-filter_complex",
       f"[0:v]tpad=stop_mode=clone:stop_duration={pad:.2f},ass={OUT}/{key}.ass[v];"
       f"[0:a]apad,atrim=0:{total},volume=-15dB[m];[1:a]adelay={int(lead*1000)}|{int(lead*1000)},aresample=48000,apad,atrim=0:{total}[n];"
       f"[n][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9[a]",
       "-map","[v]","-map","[a]","-c:v","libx264","-preset","medium","-crf","21","-pix_fmt","yuv420p","-c:a","aac","-b:a","160k",
       "-t",f"{total}","-movflags","+faststart",out)
    print("ok", key, "voz", round(d,2), "video", total)

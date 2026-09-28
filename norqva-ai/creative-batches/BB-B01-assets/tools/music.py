"""Original instrumental bed for BB-B01 videos (no third-party samples).
Warm, optimistic lo-fi/pop: 96 BPM, I–V–vi–IV in D major, soft kick, hats, pluck arpeggio,
pad chords and a simple bass. Output: 48 kHz stereo WAV of the requested length, faded.
Usage: python3 music.py <seconds> <out.wav>
"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 48000
BPM = 96
BEAT = 60 / BPM
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def env(n, a=0.005, d=0.1, s=0.6, r=0.2, length=None):
    length = length or n
    t = np.arange(length) / SR
    e = np.ones(length) * s
    ai = int(a * SR); di = int(d * SR); ri = int(r * SR)
    if ai: e[:ai] = np.linspace(0, 1, ai)
    if di: e[ai:ai + di] = np.linspace(1, s, min(di, max(0, length - ai)))[: max(0, min(di, length - ai))]
    if ri and length > ri: e[-ri:] *= np.linspace(1, 0, ri)
    return e


def lowpass(x, cutoff):
    b, a = butter(2, cutoff / (SR / 2), 'low')
    return lfilter(b, a, x)


def highpass(x, cutoff):
    b, a = butter(2, cutoff / (SR / 2), 'high')
    return lfilter(b, a, x)


def pad(freqs, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            s += np.sin(2 * np.pi * ff * t) * 0.5 + 0.25 * np.sin(2 * np.pi * 2 * ff * t)
    s = lowpass(s, 1800)
    return s * env(n, a=0.25, d=0.3, s=0.8, r=0.35) / (len(freqs) * 3)


def pluck(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2 * f * t) + 0.12 * np.sin(2 * np.pi * 3 * f * t))
    return s * np.exp(-t * 7.5) * 0.9


def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)
    return lowpass(s, 400) * env(n, a=0.01, d=0.15, s=0.7, r=0.08)


def kick(dur=0.35):
    n = int(dur * SR); t = np.arange(n) / SR
    f = 110 * np.exp(-t * 18) + 45
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 9)


def hat(dur=0.06):
    n = int(dur * SR)
    return highpass(rng.standard_normal(n), 7000) * np.exp(-np.arange(n) / SR * 60) * 0.25


def snap(dur=0.18):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 1500)
    return (noise * 0.6 + np.sin(2 * np.pi * 190 * t) * 0.4) * np.exp(-t * 22) * 0.55


def add(buf, sig, start, gain=1.0):
    i = int(start * SR)
    if i >= len(buf): return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i] * gain


def render(seconds):
    total = int(seconds * SR)
    L = np.zeros(total); R = np.zeros(total)
    # D major: D(62) A(57/69) Bm(59) G(55)
    prog = [
        (50, [62, 66, 69, 73]),   # Dmaj7
        (45, [61, 64, 69, 73]),   # A (add9-ish)
        (47, [62, 66, 71, 74]),   # Bm7
        (43, [62, 67, 71, 74]),   # Gmaj7
    ]
    bar = 4 * BEAT
    b = 0
    while b * bar < seconds + bar:
        root, chord = prog[b % 4]
        t0 = b * bar
        p = pad([midi(n) for n in chord], bar + 0.3)
        add(L, p, t0, 0.55); add(R, p, t0, 0.55)
        for k in range(4):
            add(L, bass(midi(root), BEAT * 0.9), t0 + k * BEAT, 0.55)
            add(R, bass(midi(root), BEAT * 0.9), t0 + k * BEAT, 0.55)
        arp = [chord[0] + 12, chord[2] + 12, chord[1] + 12, chord[3] + 12, chord[2] + 12, chord[1] + 12, chord[0] + 12, chord[2]]
        for k, n in enumerate(arp):
            pl = pluck(midi(n), BEAT * 0.9)
            pan = 0.35 if k % 2 == 0 else -0.35
            add(L, pl, t0 + k * BEAT / 2, 0.22 * (1 - pan)); add(R, pl, t0 + k * BEAT / 2, 0.22 * (1 + pan))
        if b >= 1:  # drums enter after the first bar
            for k in range(4):
                if k in (0, 2):
                    kk = kick(); add(L, kk, t0 + k * BEAT, 0.7); add(R, kk, t0 + k * BEAT, 0.7)
                else:
                    sn = snap(); add(L, sn, t0 + k * BEAT, 0.35); add(R, sn, t0 + k * BEAT, 0.35)
            for k in range(8):
                h = hat(); g = 0.16 if k % 2 else 0.10
                add(L, h, t0 + k * BEAT / 2, g * 0.8); add(R, h, t0 + k * BEAT / 2, g)
        b += 1
    mix = np.stack([L, R], axis=1)
    # fades
    fi = int(0.4 * SR); fo = int(1.2 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    # soft limiter + normalize to -1 dBFS peak
    mix = np.tanh(mix * 1.4)
    mix /= np.max(np.abs(mix)) / 0.89
    return mix.astype(np.float32)


if __name__ == '__main__':
    secs = float(sys.argv[1]); out = sys.argv[2]
    wavfile.write(out, SR, render(secs))
    print('ok', out, secs)

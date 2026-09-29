import cv2, numpy as np, os, subprocess, shutil, sys
FPS = 30
# (source, start, end, speed)
PLANS = {
  'M1': [('rec_b.mp4', 0.0, 1.2, 1), ('rec_b.mp4', 5.0, 6.3, 1), ('rec_b.mp4', 10.0, 29.5, 8), ('rec_b.mp4', 29.8, 33.1, 1)],
  'M2': [('rec_a.mp4', 28.5, 32.0, 1), ('rec_b.mp4', 54.2, 58.5, 1)],
}
BUBBLE = {'rec_b.mp4': (342, 354, 392, 406), 'rec_a.mp4': (362, 356, 392, 404)}  # x0,y0,x1,y1

def greenish(px):
    r, g, b = px[..., 2].astype(int), px[..., 1].astype(int), px[..., 0].astype(int)
    lum = (r + g + b) / 3
    return (g > r + 3) & (g >= b - 2) & (lum < 135)

def hide_email(img):
    h = img.shape[0]
    band = img[:230, 160:268]
    gm = greenish(band)
    left = greenish(img[:230, 110:130])
    rows = [y for y in range(230) if gm[y].sum() > 30 and left[y].sum() < 3]
    if not rows:
        return cover(img, LAST[0]) if LAST[0] else (img, None)
    # group rows into the badge block (largest contiguous run with small gaps)
    runs, cur = [], [rows[0]]
    for y in rows[1:]:
        if y - cur[-1] <= 4: cur.append(y)
        else: runs.append(cur); cur = [y]
    runs.append(cur)
    run = max(runs, key=len)
    y0, y1 = max(0, run[0] - 4), min(h, run[-1] + 5)
    if y1 - y0 < 10 or y1 - y0 > 45:
        return cover(img, LAST[0]) if LAST[0] else (img, None)
    LAST[0] = (y0, y1)
    return cover(img, (y0, y1))

LAST = [None]
def cover(img, yy):
    y0, y1 = yy
    x0, x1 = 156, 272
    roi = img[y0:y1, x0:x1]
    # solid pill in the badge colour (no text), keeps the look of the header
    col = np.median(roi.reshape(-1, 3)[greenish(roi).reshape(-1)], axis=0) if greenish(roi).any() else np.array([66, 82, 62])
    img[y0:y1, x0:x1] = cv2.GaussianBlur(roi, (0, 0), 9)
    mask = np.zeros(img.shape[:2], np.uint8)
    cv2.rectangle(mask, (x0 + 6, y0 + 3), (x1 - 6, y1 - 3), 255, -1)
    img[mask > 0] = (0.15 * img[mask > 0] + 0.85 * col).astype(np.uint8)
    return img, (y0, y1)

def process(src, frame):
    x0, y0, x1, y1 = BUBBLE[src]
    m = np.zeros(frame.shape[:2], np.uint8); m[y0:y1, x0:x1] = 255
    frame = cv2.inpaint(frame, m, 5, cv2.INPAINT_TELEA)
    frame, _ = hide_email(frame)
    frame = frame[27:800]                       # drop Android status and navigation bars
    frame = cv2.resize(frame, (508, 1014), interpolation=cv2.INTER_LANCZOS4)
    return frame[:, 7:501]                       # 494 x 1014 phone screen

for key, plan in PLANS.items():
    out = f'screen_{key}'; shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    n = 0
    for src, a, b, sp in plan:
        LAST[0] = None
        tmp = 'tmp_seg'; shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(a), '-t', str(b - a), '-i', src,
                        '-vf', f'setpts=PTS/{sp},fps={FPS}', f'{tmp}/s%05d.png'], check=True)
        for f in sorted(os.listdir(tmp)):
            fr = cv2.imread(f'{tmp}/{f}')
            cv2.imwrite(f'{out}/f{n:05d}.png', process(src, fr)); n += 1
        shutil.rmtree(tmp)
    print(key, n, 'frames', n / FPS, 's')

"""Physically-flavoured finale background plate: haze, spotlight, searchlights, gerbs, fireworks, camera flashes.
Renders to an H.264 mp4 through ffmpeg. Usage: python3 render.py W H out.mp4 [preview_frames_dir]"""
import sys, subprocess, math, os
import numpy as np, cv2

W, H, OUT = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
PREV = sys.argv[4] if len(sys.argv) > 4 else None
FPS, DUR = 30, 9.0
N = int(FPS * DUR)
rng = np.random.default_rng(7)
portrait = H > W
S = min(W, H) / 720.0  # scale for sizes/speeds
G = 900.0 * S          # gravity px/s^2

BASE = np.array([0.012, 0.018, 0.013], np.float32)  # near-black green hall
WARM = np.array([1.0, 0.78, 0.45], np.float32)
WHITE = np.array([1.0, 0.97, 0.9], np.float32)
LIME = np.array([0.80, 1.0, 0.45], np.float32)
GOLD = np.array([1.0, 0.72, 0.28], np.float32)

yy, xx = np.mgrid[0:H // 2, 0:W // 2].astype(np.float32) * 2  # half-res grid for light fields

# Haze: tiling low-frequency noise, scrolled slowly.
def noise(h, w, scale, seed):
    r = np.random.default_rng(seed).random((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    r = cv2.resize(r, (w, h), interpolation=cv2.INTER_CUBIC)
    return cv2.GaussianBlur(r, (0, 0), scale * .6)
hz_h, hz_w = H // 2 + 200, W // 2 + 400
haze_a = noise(hz_h, hz_w, 40, 1); haze_b = noise(hz_h, hz_w, 18, 2)
haze_a = (haze_a - haze_a.min()) / (np.ptp(haze_a) + 1e-6); haze_b = (haze_b - haze_b.min()) / (np.ptp(haze_b) + 1e-6)
def haze(t):
    ox = int(150 + 120 * math.sin(t * .25)); oy = int(100 - 40 * t)
    a = np.roll(haze_a, (oy % hz_h, ox), (0, 1))[:H // 2, :W // 2]
    b = np.roll(haze_b, ((-oy // 2) % hz_h, -ox), (0, 1))[:H // 2, :W // 2]
    v = .55 * a + .45 * b
    floor = np.clip((yy / H - .35) / .65, 0, 1)  # thicker near the floor
    return (.15 + 1.1 * v ** 1.6) * (.45 + .8 * floor)

def cone(sx, sy, ang, width, length):
    dx, dy = xx - sx, yy - sy
    d = np.sqrt(dx * dx + dy * dy) + 1
    a = np.arctan2(dx, -dy)  # 0 = straight up
    da = (a - ang + np.pi) % (2 * np.pi) - np.pi
    core = np.exp(-(da / width) ** 2)
    fall = np.exp(-d / length) * np.clip(d / (40 * S), 0, 1)
    return core * fall

def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

# ---------- particles ----------
class Sys:
    def __init__(s):
        s.p = np.zeros((0, 2), np.float32); s.v = np.zeros((0, 2), np.float32)
        s.age = np.zeros(0, np.float32); s.life = np.zeros(0, np.float32)
        s.col = np.zeros((0, 3), np.float32); s.drag = np.zeros(0, np.float32)
        s.bri = np.zeros(0, np.float32); s.tw = np.zeros(0, np.float32); s.g = np.zeros(0, np.float32)
    def add(s, p, v, life, col, drag, bri, tw, g=1.0):
        n = len(v)
        s.p = np.vstack([s.p, np.broadcast_to(p, (n, 2))]).astype(np.float32); s.v = np.vstack([s.v, v]).astype(np.float32)
        s.age = np.concatenate([s.age, np.zeros(n, np.float32)]); s.life = np.concatenate([s.life, life]).astype(np.float32)
        s.col = np.vstack([s.col, np.broadcast_to(col, (n, 3)) if np.ndim(col) == 1 else col]).astype(np.float32)
        s.drag = np.concatenate([s.drag, np.full(n, drag, np.float32)]); s.bri = np.concatenate([s.bri, bri]).astype(np.float32)
        s.tw = np.concatenate([s.tw, np.full(n, tw, np.float32)]); s.g = np.concatenate([s.g, np.full(n, g, np.float32)])
    def step(s, dt, buf):
        if not len(s.p): return
        sub = 3
        for k in range(sub):
            h = dt / sub
            old = s.p.copy()
            s.v *= np.exp(-s.drag * h)[:, None]
            s.v[:, 1] += G * s.g * h
            s.p += s.v * h
            s.age += h
            u = np.clip(s.age / s.life, 0, 1)
            # hot-white to colour, then fade; crackle twinkle near the end
            heat = np.clip(1 - u * 2.2, 0, 1)[:, None]
            c = s.col * (1 - heat) + WHITE * heat
            fade = (1 - u) ** 1.6
            tw = np.where((u > .55) & (s.tw > 0), (np.random.random(len(u)) > .45).astype(np.float32), 1.0)
            inten = s.bri * fade * tw / sub
            for i in np.nonzero(inten > .01)[0]:
                cv2.line(buf, (int(old[i, 0]), int(old[i, 1])), (int(s.p[i, 0]), int(s.p[i, 1])), (c[i] * inten[i]).tolist(), 2 if s.bri[i] > 4.5 else 1)
        keep = s.age < s.life
        for n in ('p', 'v', 'age', 'life', 'col', 'drag', 'bri', 'tw', 'g'):
            setattr(s, n, getattr(s, n)[keep])

parts = Sys(); rockets = []
def spray(n, ang_c, spread, spd, spd_j):
    a = ang_c + rng.normal(0, spread, n)
    sp = spd * (1 + rng.normal(0, spd_j, n))
    return np.stack([np.sin(a) * sp, -np.cos(a) * sp], 1)

# Timeline
IMPACT = 1.0
if portrait:
    gerb_x = [.06, .28, .72, .94]
    shells = [(1.35, .20, .16, GOLD, 1.0), (1.7, .82, .12, WHITE, .9), (2.15, .5, .07, LIME, 1.1), (2.7, .12, .36, GOLD, .8),
              (3.1, .88, .30, WHITE, .85), (3.7, .35, .10, GOLD, 1.0), (4.2, .70, .18, LIME, .95), (4.9, .5, .05, WHITE, 1.15),
              (5.6, .18, .22, GOLD, .9), (6.2, .80, .24, GOLD, .9)]
else:
    gerb_x = [.08, .24, .76, .92]
    shells = [(1.35, .22, .22, GOLD, 1.0), (1.7, .78, .18, WHITE, .95), (2.15, .5, .10, LIME, 1.1), (2.7, .10, .40, GOLD, .85),
              (3.1, .90, .36, WHITE, .85), (3.7, .36, .14, GOLD, 1.0), (4.2, .65, .20, LIME, .95), (4.9, .5, .08, WHITE, 1.15),
              (5.6, .15, .26, GOLD, .9), (6.2, .85, .28, GOLD, .9)]
gerb_windows = [(IMPACT + .05, IMPACT + 1.5), (IMPACT + 2.2, IMPACT + 3.3), (IMPACT + 4.1, IMPACT + 5.1)]
for (tb, x, y, col, k) in shells:
    rockets.append(dict(t0=tb - .55, tb=tb, x=x * W, y=y * H, col=col, k=k, done=False))
flashes = [(IMPACT + .3 + rng.random() * 5.5, rng.random() * W, (.62 + rng.random() * .33) * H) for _ in range(26)]

ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT], stdin=subprocess.PIPE)
dt = 1 / FPS
for f in range(N):
    t = f * dt
    buf = np.zeros((H, W, 3), np.float32)
    # --- light fields at half res ---
    hz = haze(t)
    light = np.zeros((H // 2, W // 2, 3), np.float32)
    spot_on = smooth(t, .15, .55) * (1 - .45 * smooth(t, IMPACT + .4, IMPACT + 2.5))
    flick = 1 - .25 * smooth(t, .55, .6) * (1 - smooth(t, .62, .7))  # one nervous flicker before impact
    if spot_on > 0:
        sp = cone(W / 2, -40 * S, 0, .16 if portrait else .11, 1.6 * H) * hz
        pool = np.exp(-(((xx - W / 2) / (W * (.26 if portrait else .16))) ** 2 + ((yy - H * .86) / (H * .05)) ** 2))
        light += (sp * .5 + pool * .35)[..., None] * WHITE * spot_on * flick
    on = smooth(t, IMPACT + .2, IMPACT + 1.0)
    if on > 0:
        for side in (-1, 1):
            for j, ph in enumerate((0,)):
                ang = side * (-.32 + .26 * math.sin(.55 * (t - IMPACT) + ph + (side > 0) * 2.1)) * (1 if portrait else .8)
                sx = W / 2 + side * W * (.56 if j == 0 else .30); sy = H + 20
                c = cone(sx, sy, ang, .034 if portrait else .028, 1.1 * H) * (.35 + .65 * hz)
                light += c[..., None] * (WHITE * .42 + WARM * .12) * on
    # ambient floor glow from pyro
    glow = 0
    for (a, b) in gerb_windows:
        glow += smooth(t, a, a + .12) * (1 - smooth(t, b - .2, b + .3))
    if glow > 0:
        for gx in gerb_x:
            light += (np.exp(-(((xx - gx * W) / (W * .14)) ** 2 + ((yy - H) / (H * .14)) ** 2)) * glow * .22)[..., None] * WARM
    buf += cv2.resize(light, (W, H), interpolation=cv2.INTER_LINEAR)
    # --- gerbs ---
    for (a, b) in gerb_windows:
        if a <= t < b:
            for gx in gerb_x:
                n = 20
                lean = (gx - .5) * .25
                v = spray(n, lean, .07, 1500 * S * (1 if portrait else .8), .18)
                life = rng.uniform(.8, 1.4, n)
                parts.add(np.array([gx * W + rng.normal(0, 2), H - 4.0]), v, life, GOLD * rng.uniform(.8, 1.1, (n, 1)), 1.2, rng.uniform(4, 7, n), 1)
    # --- rockets & bursts ---
    for r in rockets:
        if r['done'] or t < r['t0']: continue
        if t < r['tb']:
            u = (t - r['t0']) / (r['tb'] - r['t0']); u2 = 1 - (1 - u) ** 2
            x = r['x'] + 10 * S * math.sin(u * 7); y = H + 10 - (H + 10 - r['y']) * u2
            v = spray(3, math.pi, .3, 120 * S, .3)
            parts.add(np.array([x, y]), v, rng.uniform(.25, .5, 3), WARM, 3, np.full(3, 1.6), 0, .4)
        else:
            r['done'] = True
            n = int(220 * r['k'])
            th = rng.uniform(0, 2 * np.pi, n); ph = np.arccos(rng.uniform(-1, 1, n))
            sp = 720 * S * r['k'] * (.92 + rng.normal(0, .06, n))
            v = np.stack([np.cos(th) * np.sin(ph) * sp, np.sin(th) * np.sin(ph) * sp], 1)
            col = np.where(rng.random((n, 1)) < .25, WHITE, r['col'])
            parts.add(np.array([r['x'], r['y']]), v, rng.uniform(1.4, 2.3, n), col, 2.3, rng.uniform(5, 9, n), 1, .55)
            # burst core flash
            cv2.circle(buf, (int(r['x']), int(r['y'])), int(30 * S), (r['col'] * 6).tolist(), -1)
    parts.step(dt, buf)
    # --- camera flashes ---
    for (ft, fx, fy) in flashes:
        if ft <= t < ft + 2 * dt:
            cv2.circle(buf, (int(fx), int(fy)), int(3 * S), (WHITE * 25).tolist(), -1)
    # --- impact flash + anamorphic streak ---
    k = math.exp(-max(0.0, t - IMPACT) * 5.5) if t >= IMPACT else 0
    if k > .01:
        buf += (np.exp(-(((np.arange(W) - W / 2) / (W * .38)) ** 2))[None, :, None] * np.exp(-(((np.arange(H) - H * .48) / (H * .26)) ** 2))[:, None, None]) * WHITE * 1.0 * k
        streak = np.exp(-(((np.arange(H) - H * .48) / (3 * S)) ** 2))[:, None] * np.exp(-(((np.arange(W) - W / 2) / (W * .7)) ** 2))[None, :]
        buf += streak[..., None] * np.array([.75, .9, 1.0], np.float32) * 6 * k
    # --- bloom (BGR order handled at output) ---
    small = cv2.resize(buf, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    bloom = cv2.GaussianBlur(buf, (0, 0), 2.2 * S) * .9 + cv2.resize(cv2.GaussianBlur(small, (0, 0), 4 * S), (W, H)) * .8 + cv2.resize(cv2.GaussianBlur(small, (0, 0), 14 * S), (W, H)) * .7
    img = buf * .55 + bloom + BASE
    # vignette
    if f == 0:
        vy = np.linspace(-1, 1, H)[:, None]; vx = np.linspace(-1, 1, W)[None, :]
        vig = (1 - .55 * np.clip((vx ** 2 * .8 + vy ** 2) - .25, 0, 1))[..., None].astype(np.float32)
    img *= vig
    img = 1 - np.exp(-img * 1.0)               # filmic-ish tone map
    img = np.power(np.clip(img, 0, 1), 1 / 1.15)
    grain = rng.normal(0, .006, (H // 2, W // 2)).astype(np.float32)
    img += cv2.resize(grain, (W, H))[..., None]
    out = (np.clip(img, 0, 1)[..., ::-1] * 255).astype(np.uint8)  # RGB->BGR
    ff.stdin.write(out.tobytes())
    if PREV and f % 15 == 0:
        cv2.imwrite(os.path.join(PREV, f'f{f:03d}.jpg'), out)
ff.stdin.close(); ff.wait()

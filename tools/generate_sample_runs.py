"""Simulate an RC car driving 3 laps of a small oval and log it the way the
MIVD micro:bit logger does: 100 Hz accelerometer readings averaged into one
row every 0.1 s (run, time_ms, ax_mg, ay_mg, az_mg, forward_ms2, lateral_ms2,
vib_rms_mg, peak_g, speed_est_mph).

Run 1 has stock tires; run 2 has grippier tires (more cornering grip and
slightly better launch and braking traction). Requires numpy.

Usage: python3 tools/generate_sample_runs.py [output_dir]"""
import csv, math, sys
import numpy as np

G = 9.80665
STRAIGHT = 12.0      # m, each straight
RADIUS = 3.0         # m, each 180 degree turn (left-hand oval)
EASE = 1.2           # m, curvature ramps in/out over this distance
LAPS = 3
STOP_ZONE = 9.0      # m of straight available after the finish line
DS = 0.01            # m, path resolution


def curvature(s):
    """Curvature (1/m) at distance s along the lap: straight, turn, straight, turn."""
    lap = 2 * STRAIGHT + 2 * math.pi * RADIUS
    x = s % lap
    turn = math.pi * RADIUS
    for start in (STRAIGHT, 2 * STRAIGHT + turn):
        a, b = start - EASE / 2, start + turn + EASE / 2
        if a <= x <= b:
            k = 1 / RADIUS
            if x < a + EASE:
                return k * (x - a) / EASE
            if x > b - EASE:
                return k * (b - x) / EASE
            return k
    return 0.0


def simulate(car, seed):
    rng = np.random.default_rng(seed)
    lap = 2 * STRAIGHT + 2 * math.pi * RADIUS
    total = LAPS * lap + STOP_ZONE
    s = np.arange(0, total, DS)
    kappa = np.array([curvature(x) for x in s])
    # The driver uses a slightly different share of the grip in each turn.
    turn_index = np.floor((s + EASE) / (lap / 2)).astype(int)
    use = car["grip_use"] + rng.normal(0, 0.015, turn_index.max() + 2)[turn_index]
    vlim = np.where(kappa > 1e-6, np.sqrt(use * car["mu"] * G / np.maximum(kappa, 1e-6)), 99.0)

    # Forward pass: motor limited acceleration, reduced while cornering (friction circle).
    v = np.zeros_like(s)
    for i in range(1, len(s)):
        lat = v[i - 1] ** 2 * kappa[i - 1]
        share = max(0.0, 1 - (lat / (car["mu"] * G)) ** 2) ** 0.5
        a = min(car["launch"] * G, car["power"] / max(v[i - 1], 0.3)) * (1 - v[i - 1] / car["vtop"]) * share
        v[i] = min(vlim[i], math.sqrt(v[i - 1] ** 2 + 2 * max(a, 0) * DS))
    # Backward pass: braking limit, ending stopped at the end of the stop zone.
    v[-1] = 0.0
    for i in range(len(s) - 2, -1, -1):
        lat = v[i + 1] ** 2 * kappa[i + 1]
        share = max(0.0, 1 - (lat / (car["mu"] * G)) ** 2) ** 0.5
        b = car["brake"] * G * max(share, 0.15)
        v[i] = min(v[i], math.sqrt(v[i + 1] ** 2 + 2 * b * DS))

    # Distance -> time, then resample at 100 Hz.
    vm = np.maximum((v[1:] + v[:-1]) / 2, 0.05)
    t_path = np.concatenate([[0], np.cumsum(DS / vm)])
    pre, post = car["pre_s"], 1.8
    t100 = np.arange(0, pre + t_path[-1] + post, 0.01)
    tm = np.clip(t100 - pre, 0, t_path[-1])
    pos = np.interp(tm, t_path, s)
    vel = np.interp(tm, t_path, v)
    vel[t100 < pre] = 0
    vel[t100 > pre + t_path[-1]] = 0
    k100 = np.array([curvature(x) for x in pos])
    a_long = np.gradient(vel, 0.01)
    a_long = np.convolve(a_long, np.ones(5) / 5, mode="same")  # drivetrain/tire compliance
    a_lat = vel ** 2 * k100
    lap_cross = [pre + float(np.interp(n * lap, s, t_path)) for n in range(1, LAPS + 1)]
    return t100, vel, a_long, a_lat, pos, lap_cross, rng


def log_rows(run_id, car, seed):
    t, vel, a_long, a_lat, pos, laps, rng = simulate(car, seed)
    moving = vel > 0.05
    # Body lean makes the board tilt toward the force, so readings come out a little high.
    long_meas = a_long * 1.05
    lat_meas = a_lat * 1.07
    # Vibration from motor and road grows with speed; a floor seam on the back straight gives a jolt.
    vib_rms = np.where(moving, 14 + 5.5 * vel, 0) * car["vib_scale"]
    n = len(t)
    noise = lambda sd: rng.normal(0, 1, n) * sd
    lap_len = 2 * STRAIGHT + 2 * math.pi * RADIUS
    seam = np.zeros(n)
    xlap = pos % lap_len
    seam_at = STRAIGHT + math.pi * RADIUS + 6.0
    for i in range(1, n):
        if moving[i] and xlap[i - 1] < seam_at <= xlap[i]:
            seam[i:i + 3] += np.array([1, -0.6, 0.3])[: len(seam[i:i + 3])] * car["seam_mg"] * vel[i] / 6
    off = {"x": 14, "y": -22}                      # mounting/offset seen at rest
    ax = off["x"] + lat_meas / G * 1000 + noise(4) + np.where(moving, noise(1) * vib_rms * 0.55, 0)
    ay = off["y"] + long_meas / G * 1000 + noise(4) + np.where(moving, noise(1) * vib_rms * 0.55, 0)
    az = -1000 + 0.5 * (np.hypot(lat_meas, long_meas) / G) ** 2 * 1000 * 0.05 + noise(5) \
        + np.where(moving, noise(1) * vib_rms * 0.75, 0) - seam
    # Calibration at the start is good to a couple of mg.
    cal = {"x": off["x"] + 1.5, "y": off["y"] - 1.0}

    # Speed index: firmware integrates forward acceleration and resets to zero once still.
    fwd100 = (ay - cal["y"]) / 1000 * G
    est = np.zeros(n)
    still = 0
    for i in range(1, n):
        est[i] = max(0.0, est[i - 1] + fwd100[i] * 0.01)
        mag = math.sqrt(ax[i] ** 2 + ay[i] ** 2 + az[i] ** 2)
        still = still + 1 if abs(fwd100[i]) < 0.6 and abs(mag - 1000) < 40 and vib_rms[i] < 1 else 0
        if still >= 40:
            est[i] = 0.0

    rows = []
    for k in range(1, int(len(t) / 10) + 1):
        a, b = (k - 1) * 10, k * 10
        if b > n:
            break
        mx, my, mz = ax[a:b].mean(), ay[a:b].mean(), az[a:b].mean()
        mags = np.sqrt(ax[a:b] ** 2 + ay[a:b] ** 2 + az[a:b] ** 2)
        rows.append([
            run_id, k * 100, round(mx), round(my), round(mz),
            round((my - cal["y"]) / 1000 * G, 3), round((mx - cal["x"]) / 1000 * G, 3),
            round(float(np.sqrt(np.mean((mags - mags.mean()) ** 2)))), round(float(mags.max()) / 1000, 2),
            round(est[b - 1] * 2.23694, 2),
        ])
    true = {
        "launch_s": car["pre_s"], "laps_s": laps,
        "lap_times": [laps[0] - car["pre_s"]] + [laps[i] - laps[i - 1] for i in range(1, len(laps))],
        "top_mph": float(vel.max() * 2.23694), "corner_g": float(a_lat.max() / G),
        "max_accel_g": float(a_long.max() / G), "max_brake_g": float(-a_long.min() / G),
        "stop_s": float(t[moving][-1]),
    }
    return rows, true


CARS = {
    "stock": dict(mu=0.62, grip_use=0.92, launch=0.40, brake=0.50, power=25, vtop=11.0,
                  pre_s=1.6, vib_scale=1.0, seam_mg=260),
    "modified": dict(mu=0.80, grip_use=0.92, launch=0.47, brake=0.58, power=25, vtop=11.0,
                     pre_s=1.9, vib_scale=1.0, seam_mg=260),
}

if __name__ == "__main__":
    import os
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
    for name, run_id, seed, fn in [("stock", 4302, 11, "MIVD_Simulated_Run_1_Stock.csv"),
                                   ("modified", 4303, 23, "MIVD_Simulated_Run_2_Modified.csv")]:
        rows, true = log_rows(run_id, CARS[name], seed)
        with open(f"{out}/{fn}", "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["run", "time_ms", "ax_mg", "ay_mg", "az_mg", "forward_ms2", "lateral_ms2",
                        "vib_rms_mg", "peak_g", "speed_est_mph"])
            w.writerows(rows)
        print(name, len(rows), "rows", {k: (round(v, 3) if isinstance(v, float) else [round(x, 2) for x in v]) for k, v in true.items()})

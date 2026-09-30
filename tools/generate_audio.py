#!/usr/bin/env python3
"""Original deterministic audio for Emberfall. Python standard library only.

Run: python3 tools/generate_audio.py
Then optionally: ffmpeg -y -i public/assets/audio/ambience.wav -c:a libvorbis -q:a 4 public/assets/audio/ambience.ogg
No sampled music, sound libraries or external recordings are used.
"""
from __future__ import annotations

import array
import json
import math
from pathlib import Path
import random
import wave

RATE = 24000
TAU = 2 * math.pi
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "audio"


def env(t: float, length: float, attack: float = .008, release: float = .08) -> float:
    if t < 0 or t >= length:
        return 0
    return min(1, t / attack) * min(1, (length - t) / release)


def sine(f: float, t: float, phase: float = 0) -> float:
    return math.sin(TAU * f * t + phase)


def bell(t: float, f: float, length: float = 8, brightness: float = 1) -> float:
    if t < 0 or t >= length:
        return 0
    ring = (sine(f, t) * math.exp(-t / 3.4)
            + .42 * sine(f * 2.013, t) * math.exp(-t / 2.0)
            + .20 * brightness * sine(f * 3.927, t) * math.exp(-t / .8)
            + .11 * brightness * sine(f * 5.431, t) * math.exp(-t / .5))
    return ring * env(t, length, .008, .4)


def write(name: str, length: float, sound, peak: float) -> dict:
    frames = round(length * RATE)
    values = array.array("f")
    for i in range(frames):
        left, right = sound(i / RATE, i)
        values.append(left)
        values.append(right)
    raw_peak = max(abs(x) for x in values) or 1
    gain = peak / raw_peak
    pcm = array.array("h", (round(max(-1, min(1, x * gain)) * 32767) for x in values))
    OUT.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUT / (name + ".wav")), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())
    rms = math.sqrt(sum((x * gain) ** 2 for x in values) / len(values))
    info = {
        "file": name + ".wav", "seconds": length, "sample_rate": RATE,
        "channels": 2, "peak_dbfs": round(20 * math.log10(peak), 2),
        "rms_dbfs": round(20 * math.log10(rms), 2), "bytes": (OUT / (name + ".wav")).stat().st_size,
    }
    print(json.dumps(info))
    return info


def ambience():
    length = 48
    # Every continuous oscillator has an integer number of cycles per loop.
    # Sparse bell tails also wrap, so the boundary has the same local continuity.
    def q(f):
        return round(f * length) / length
    tones = [(q(36.71), .22), (q(55), .11), (q(73.42), .055), (q(110), .025)]
    # Deterministic band-limited air is a periodic oscillator bank, no discontinuous noise.
    rng = random.Random(13417)
    air = [(q(rng.uniform(180, 2400)), rng.uniform(0, TAU), rng.uniform(.0007, .0014)) for _ in range(24)]
    bell_events = [(2, 146.83, -.55), (15, 110, .65), (27, 174.61, -.2), (39, 73.42, .35)]

    def sound(t, i):
        breathe = .76 + .16 * sine(1 / 16, t) + .08 * sine(1 / 48, t)
        base_l = sum(sine(f, t, j * .27) * a for j, (f, a) in enumerate(tones)) * breathe
        base_r = sum(sine(f, t, j * .27 + .04 * j) * a for j, (f, a) in enumerate(tones)) * breathe
        wind_l = sum(sine(f, t, ph) * a for f, ph, a in air)
        wind_r = sum(sine(f, t, ph + .65) * a for f, ph, a in air)
        air_swell = 1.6 + .7 * sine(1 / 24, t, .8)
        left, right = base_l + wind_l * air_swell, base_r + wind_r * air_swell
        for start, freq, pan in bell_events:
            age = (t - start) % length
            tone = .105 * bell(age, freq, 11, .36)
            left += tone * (1 - pan * .45)
            right += tone * (1 + pan * .45)
            echo = .024 * bell((t - start - .39) % length, freq, 10, .2)
            left += echo * (1 + pan * .45)
            right += echo * (1 - pan * .45)
        # A subdued breathlike pulse every four seconds.
        beat = t % 4
        pulse = .026 * sine(55, beat) * env(beat, 1.4, .045, .4) * math.exp(-beat * 3.3)
        return left + pulse, right + pulse
    return write("ambience", length, sound, .24)


def effect(name, length, peak):
    rng = random.Random({"hit": 19, "slash": 23, "dash": 37, "heal": 41, "pickup": 47, "boss": 59}[name])
    noise = [rng.uniform(-1, 1) for _ in range(round(length * RATE))]
    low = 0.0
    for i, value in enumerate(noise):
        low += .13 * (value - low)
        noise[i] = low

    def sound(t, i):
        n = noise[i]
        if name == "hit":
            body = sine(115, t) * math.exp(-t * 28) + .35 * sine(187, t) * math.exp(-t * 23)
            grit = n * 1.8 * math.exp(-t * 19)
            v = (body + grit + .2 * sine(1510, t) * math.exp(-t * 65)) * env(t, length, .002, .03)
            return v, v * .96
        if name == "slash":
            # Short air cut with a restrained metallic transient.
            swell = math.sin(math.pi * t / length) ** 1.7
            v = (n * 2.9 + .13 * sine(1300 - 1400 * t, t)) * swell
            glint = .08 * bell(t, 990, length, .3)
            return v * (1.1 - t) + glint, v * (.8 + t) + glint
        if name == "dash":
            swell = math.sin(math.pi * t / length) ** 1.5
            v = (n * 1.8 + .22 * sine(160 - 120 * t, t)) * swell
            return v * (1.05 - .6 * t), v * (.78 + .6 * t)
        if name == "heal":
            v = sum(.30 * bell(t - start, f, length - start, .5)
                    for start, f in [(0, 293.66), (.17, 369.99), (.34, 440), (.51, 587.33)])
            glow = .04 * sine(146.83, t) * math.sin(math.pi * t / length)
            return (v + glow) * env(t, length, .01, .3), (v * .96 + glow) * env(t, length, .01, .3)
        if name == "pickup":
            v = .5 * bell(t, 880, length, .5) + .4 * bell(t - .095, 1174.66, length - .095, .4)
            return v * env(t, length, .003, .12), v * .97 * env(t, length, .003, .12)
        # A weighty but modest-level, inharmonic boss bell with a distant stereo echo.
        core = bell(t, 48.999, length, .8) + .20 * sine(32.7, t) * math.exp(-t * 1.8)
        rumble = n * .2 * math.exp(-t * 2.4)
        echo = .17 * bell(t - .16, 73.416, length - .16, .45)
        fade = env(t, length, .007, .7)
        return (core + rumble + echo * .6) * fade, (core * .93 + rumble + echo) * fade

    return write(name, length, sound, peak)


if __name__ == "__main__":
    records = [ambience()]
    for spec in [("hit", .27, .40), ("slash", .29, .32), ("dash", .46, .32),
                 ("heal", 1.55, .34), ("pickup", .68, .28), ("boss", 2.6, .40)]:
        records.append(effect(*spec))
    manifest = {"title": "Emberfall original synthesized audio", "generator": "tools/generate_audio.py",
                "seeded": True, "provenance": "Original synthesis; no external samples or recordings.",
                "loop": "ambience.wav: 48 seconds, periodic oscillator bed and wrapped bell tails",
                "files": records}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")

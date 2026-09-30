#!/usr/bin/env python3
"""Locally synthesized elemental spell cues; no sampled or external recordings."""
import json, math, random
from generate_audio import write, env, sine, bell
from pathlib import Path

rng = random.Random(3719)
noise = [rng.uniform(-1, 1) for _ in range(100003)]

def fire(t, i):
    body = sine(48 + 26 * math.exp(-t*12), t) * math.exp(-t*4) * .6
    roar = noise[i % len(noise)] * (.32*math.exp(-t*5)+.065*math.exp(-t*1.7))
    crack = noise[(i*11) % len(noise)] * max(0, math.sin(t*107))**24 * .22 * math.exp(-t*3)
    tail = .03 * sine(146.83,t) * math.exp(-t*2)
    s = (body+roar+crack+tail)*env(t,1.6,.004,.3)
    return s, s*.86 + noise[(i+93)%len(noise)]*.04*env(t,1.6,.02,.5)*math.exp(-t*2)

def lightning(t,i):
    crack = 0
    for start in [0,.067,.16,.3]:
        a=t-start
        if a>=0: crack += noise[(i*7+12)%len(noise)]*math.exp(-a*60)*.65
    charge = (sine(970,t)*.055+sine(1470,t)*.026)*math.exp(-t*8)
    rumble = sine(57,t)*.27*math.exp(-t*4.5)+noise[i%len(noise)]*.045*math.exp(-t*3)
    ring = bell(t,440,1.3,.35)*.055
    s=(crack+charge+rumble+ring)*env(t,1.3,.001,.25)
    return s,s*.82+bell(t,660,1.3,.2)*.028

def water(t,i):
    wave=noise[i%len(noise)]*.07*math.exp(-t*2)*(1+math.sin(t*18))
    swell=sine(83,t)*.2*math.exp(-t*3)
    ripple=0
    for j in range(8):
        a=t-j*.08
        if a>=0:ripple+=sine(430+j*72,a)*math.exp(-a*16)*.075
    s=(wave+swell+ripple+bell(t,293.66,1.8,.25)*.11)*env(t,1.8,.018,.4)
    return s,s*.85+bell(max(0,t-.07),440,1.8,.25)*.035*env(t,1.8,.06,.4)

report=[write('skill-fire',1.6,fire,.78),write('skill-lightning',1.3,lightning,.76),write('skill-water',1.8,water,.71)]
(Path(__file__).resolve().parents[1]/'public/assets/audio/elements-v3.json').write_text(json.dumps(report,indent=2)+'\n')

#!/usr/bin/env python3
"""Original short crowd-clear cue, synthesized locally without sampled audio."""
import math, random, json
from pathlib import Path
from generate_audio import write, sine, env, bell
rng=random.Random(411)
noise=[rng.uniform(-1,1) for _ in range(48001)]
def strike(t,i):
    bass=sine(43+35*math.exp(-t*15),t)*math.exp(-t*7)*.6
    crack=noise[i%len(noise)]*math.exp(-t*34)*.2
    overtones=sum(bell(max(0,t-j*.045),f,1.3,.25)*(.08 if t>j*.045 else 0) for j,f in enumerate([146.83,220,293.66,440]))
    s=(bass+crack+overtones)*env(t,1.3,.002,.3)
    return s,s*.87+bell(max(0,t-.05),587.33,1.3,.2)*.018
report=write('multikill',1.3,strike,.78)
(Path(__file__).resolve().parents[1]/'public/assets/audio/multikill-v4.json').write_text(json.dumps(report,indent=2)+'\n')

import * as THREE from 'three';

export const ELEMENT_COLORS = { fire: 0xff852c, lightning: 0x9edbff, water: 0x49cfff };
const mix = THREE.MathUtils.lerp;
const ringGeo = new THREE.RingGeometry(.93, 1, 96);
const waveGeo = new THREE.CylinderGeometry(1, 1, 1, 96, 10, true);
const discGeo = new THREE.CircleGeometry(1, 80);
const shellGeo = new THREE.SphereGeometry(1, 40, 24);
const shardGeo = new THREE.OctahedronGeometry(1, 0);
const TAU = Math.PI * 2;
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, opacity, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
const clamp = THREE.MathUtils.clamp;

// The same fields that deal damage drive these surfaces. Visual quality only
// changes particle density and lighting; it never changes a hit or its radius.
export class ElementEffects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.root = new THREE.Group(); scene.add(this.root);
    this.effects = []; this.particles = []; this.fields = new Map(); this.time = 0;
    this.settings = { quality: 'high', effects: 1, shake: true, bloom: true };
    this.shake = 0; this.flash = 0; this.punch = 0;
    this.capacity = 2400;
    this.positions = new Float32Array(this.capacity * 3); this.colors = new Float32Array(this.capacity * 3); this.sizes = new Float32Array(this.capacity);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geometry, new THREE.ShaderMaterial({
      uniforms: { pixelScale: { value: 32 } }, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `attribute float size; uniform float pixelScale; varying vec3 vColor; void main(){ vColor=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=clamp(size*pixelScale,1.,55.); }`,
      fragmentShader: `varying vec3 vColor; void main(){vec2 p=gl_PointCoord-.5;float d=length(p)*2.;float a=pow(max(0.,1.-d),2.);float core=pow(max(0.,1.-d),8.);gl_FragColor=vec4(vColor*(.75+core*2.),a);}`,
    }));
    this.points.frustumCulled = false; this.points.renderOrder = 6; this.root.add(this.points);
    this.light = new THREE.PointLight(0xff9c43, 0, 13, 2); scene.add(this.light);
    this.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false,
      vertexShader: `varying vec3 vNormal;varying vec3 vEye;varying vec3 vPos;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vEye=normalize(-p.xyz);vPos=position;gl_Position=projectionMatrix*p;}`,
      fragmentShader: `uniform float time;uniform float opacity;varying vec3 vNormal;varying vec3 vEye;varying vec3 vPos;void main(){float f=pow(1.-abs(dot(normalize(vNormal),vEye)),2.8);float ripple=pow(.5+.5*sin(vPos.y*27.-time*3.),15.);gl_FragColor=vec4(.2,.74,1.,(f*.5+ripple*.12)*opacity);}`,
    }));
    this.shield.scale.set(1.1, 1.65, 1.1); this.root.add(this.shield); this.shield.visible = false;
  }
  configure(settings) { Object.assign(this.settings, settings); }
  resize(height, worldHeight) { this.points.material.uniforms.pixelScale.value = height / worldHeight; }
  get budget() { return Math.round((this.settings.quality === 'low' ? 320 : this.settings.quality === 'medium' ? 1000 : 1600) * this.settings.effects); }
  add(object, life, animate = null, ownGeometry = false) {
    if (this.effects.length >= 150) this.remove(this.effects.shift());
    this.root.add(object); const e = { object, life, duration: life, animate, ownGeometry }; this.effects.push(e); return object;
  }
  remove(e) {
    e.object.removeFromParent();
    e.object.traverse(o => { if (o.isInstancedMesh) o.dispose(); if (e.ownGeometry && o.geometry) o.geometry.dispose(); if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose(); });
  }
  burstParticles(x, z, count, element, radius = 1, speed = 5, y = .35) {
    const n = Math.round(count * this.settings.effects * (this.settings.quality === 'low' ? .35 : this.settings.quality === 'medium' ? .65 : 1));
    for (let i = 0; i < n && this.particles.length < this.budget; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * radius, life = .35 + Math.random() * .85;
      const color = new THREE.Color(ELEMENT_COLORS[element] || 0xc5efde).lerp(new THREE.Color(0xffffff), Math.random() * .38);
      const outward = speed * (.4 + Math.random() * .6);
      this.particles.push({ x: x + Math.sin(a) * r, y: y + Math.random() * .5, z: z + Math.cos(a) * r, vx: Math.sin(a) * outward, vy: element === 'water' ? 1 + Math.random() * 3 : 1.5 + Math.random() * 5, vz: Math.cos(a) * outward, gravity: element === 'fire' ? -1 : -7, life, duration: life, size: .06 + Math.random() * (element === 'fire' ? .34 : .17), color });
    }
  }
  ring(x, z, radius, element, life = .6, delay = 0) {
    const m = glow(ELEMENT_COLORS[element] || 0xd8efde, .8); const o = new THREE.Mesh(ringGeo, m); o.rotation.x = -Math.PI / 2; o.position.set(x, .075, z);
    this.add(o, life + delay, (o, t) => { const q = clamp((t * (life + delay) - delay) / life, 0, 1); o.visible = t * (life + delay) >= delay; o.scale.setScalar(mix(.35, radius, 1 - (1 - q) ** 2)); m.opacity = (1 - q) * .85; });
  }
  wave(x, z, radius, element, duration = .8, delay = 0) {
    const isFire = element === 'fire';
    const mat = new THREE.ShaderMaterial({
      uniforms: { progress: { value: 0 }, time: { value: 0 }, color: { value: new THREE.Color(ELEMENT_COLORS[element]) }, fiery: { value: isFire ? 1 : 0 } },
      side: THREE.DoubleSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `uniform float progress;uniform float time;uniform float fiery;varying vec2 vUv;varying float vH;void main(){vUv=uv;vH=position.y+.5;vec3 p=position;float f=sin(uv.x*100.+time*7.)*.15+sin(uv.x*47.-time*4.)*.18;p.y=(position.y+.5)*(1.+f*(.4+fiery))-0.03;p.xz*=1.+sin(uv.x*85.+time*3.)*.015;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader: `uniform float progress;uniform float time;uniform vec3 color;uniform float fiery;varying vec2 vUv;varying float vH;void main(){float n=sin(vUv.x*95.+time*4.)*sin(vUv.x*31.-vH*6.+time*2.);float flame=pow(max(0.,1.-vH),1.7)*smoothstep(-.6,.65,n-vH*.4);float foam=pow(.5+.5*sin(vUv.x*120.+time*8.),3.)*pow(vH,6.);float a=mix((1.-vH)*.4+foam*.7,flame,fiery)*(1.-progress);vec3 c=mix(color,vec3(1.,.94,.7),fiery*pow(1.-vH,5.));c=mix(c,vec3(.77,.96,1.),foam*(1.-fiery));gl_FragColor=vec4(c*1.6,a*.8);}`,
    });
    const o = new THREE.Mesh(waveGeo, mat); o.position.set(x, .04, z);
    this.add(o, duration + delay, (o, t) => { const q = clamp((t * (duration + delay) - delay) / duration, 0, 1); o.visible = t * (duration + delay) >= delay; const r = mix(.3, radius, 1 - (1 - q) ** 2); o.scale.set(r, (isFire ? 3.9 : 2.25) * Math.sin(q * Math.PI) + .15, r); mat.uniforms.progress.value = q; mat.uniforms.time.value = this.time; });
  }
  bolt(points, life = .28, color = ELEMENT_COLORS.lightning) {
    const coords = []; const branch = []; const origin = points[0];
    for (let p = 1; p < points.length; p++) {
      const a = points[p - 1], b = points[p]; const length = Math.hypot(b.x - a.x, (b.y || 1) - (a.y || 1), b.z - a.z); const count = Math.max(5, Math.ceil(length * 3)); let prior = [a.x, a.y ?? 1.1, a.z];
      for (let i = 1; i <= count; i++) { const t = i / count, jitter = Math.sin(Math.PI * t) * .5; const current = [mix(a.x, b.x, t) + (Math.random() - .5) * jitter, mix(a.y ?? 1.1, b.y ?? 1.1, t) + (Math.random() - .5) * jitter, mix(a.z, b.z, t) + (Math.random() - .5) * jitter]; coords.push(...prior, ...current); if (i % 4 === 0) branch.push(...current, current[0] + (Math.random() - .5) * 1.3, current[1] + .35, current[2] + (Math.random() - .5) * 1.3); prior = current; }
    }
    const group = new THREE.Group();
    for (const [list, c, opacity] of [[coords, 0xecfaff, 1], [branch, color, .6]]) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(list, 3)); group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))); }
    const ribbons=[];
    for(let i=0;i<coords.length;i+=6){const a=new THREE.Vector3(...coords.slice(i,i+3)),b=new THREE.Vector3(...coords.slice(i+3,i+6));const mid=a.clone().add(b).multiplyScalar(.5),side=b.clone().sub(a).cross(this.camera.position.clone().sub(mid)).normalize().multiplyScalar(.105);const aa=a.clone().add(side),ab=a.clone().sub(side),ba=b.clone().add(side),bb=b.clone().sub(side);for(const p of[aa,ab,bb,aa,bb,ba])ribbons.push(p.x,p.y,p.z);}
    const glowGeometry=new THREE.BufferGeometry();glowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ribbons,3));group.add(new THREE.Mesh(glowGeometry,glow(color,.36)));
    this.add(group, life, (o, t) => { o.visible = t < .52 || Math.sin(t * 40) > -.55; for (const c of o.children) c.material.opacity = (1 - t) * (c.isMesh ? .3 : 1); }, true);
    this.burstParticles(origin.x, origin.z, 5, 'lightning', .2, .7, origin.y ?? 1);
  }
  sigil(x, z, radius, element, life = 1.1) {
    const material = new THREE.ShaderMaterial({
      uniforms: { age: { value: 0 }, color: { value: new THREE.Color(ELEMENT_COLORS[element]) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: `varying vec2 p;void main(){p=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float age;uniform vec3 color;varying vec2 p;void main(){float r=length(p),a=atan(p.y,p.x)+age*.24;float ring=exp(-abs(r-.94)*190.)+exp(-abs(r-.78)*130.);float runes=step(.77,r)*step(r,.94)*pow(.5+.5*sin(a*24.),36.);float spokes=pow(.5+.5*cos(a*8.+r*5.),80.)*smoothstep(.4,.7,r)*(1.-smoothstep(.74,.8,r));float fade=pow(1.-age,1.6);gl_FragColor=vec4(color*1.8,(ring*.62+runes*.7+spokes*.75)*fade);}`,
    });
    const o = new THREE.Mesh(discGeo, material);o.rotation.x=-Math.PI/2;o.position.set(x,.085,z);o.scale.setScalar(radius);
    this.add(o,life,(_,t)=>{material.uniforms.age.value=t;});
  }
  shockShell(x,z,radius,element) {
    const material = new THREE.ShaderMaterial({
      uniforms:{age:{value:0},color:{value:new THREE.Color(ELEMENT_COLORS[element])}},
      transparent:true,depthWrite:false,side:THREE.FrontSide,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:`varying vec3 n;varying vec3 eye;varying vec3 p;void main(){p=position;vec4 v=modelViewMatrix*vec4(position,1.);n=normalize(normalMatrix*normal);eye=normalize(-v.xyz);gl_Position=projectionMatrix*v;}`,
      fragmentShader:`uniform float age;uniform vec3 color;varying vec3 n;varying vec3 eye;varying vec3 p;void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),3.);float strips=pow(.5+.5*sin(p.y*32.-age*18.),18.);float alpha=(rim*.42+strips*.11)*(1.-age);gl_FragColor=vec4(color*2.,alpha);}`,
    });
    const o=new THREE.Mesh(shellGeo,material);o.position.set(x,.15,z);
    this.add(o,.48,(_,t)=>{const r=radius*(1.-(1.-t)**3);o.scale.set(r,Math.max(.12,r*.42*(1.-t)),r);material.uniforms.age.value=t;});
  }
  shards(x,z,radius,element,count=12) {
    const n=this.settings.quality==='low'?Math.ceil(count*.4):count;
    const material=new THREE.MeshStandardMaterial({color:ELEMENT_COLORS[element],emissive:ELEMENT_COLORS[element],emissiveIntensity:element==='fire'?2.4:1.2,metalness:.38,roughness:.23,transparent:true});
    const batch=new THREE.InstancedMesh(shardGeo,material,n);batch.frustumCulled=false;
    const d=new THREE.Object3D(),seeds=Array.from({length:n},(_,i)=>({a:i/n*TAU,range:radius*(.25+Math.random()*.6),height:1.5+Math.random()*3,spin:Math.random()*TAU}));
    this.add(batch,1.05,(o,t)=>{material.opacity=Math.min(1,(1.-t)*3);seeds.forEach((s,i)=>{const travel=1-(1-t)**2;d.position.set(x+Math.sin(s.a)*s.range*travel,.15+Math.sin(t*Math.PI)*s.height,z+Math.cos(s.a)*s.range*travel);d.rotation.set(s.spin+t*5,t*7,s.a);const size=(.1+Math.sin(t*Math.PI)*.16)*(1-t*.6);d.scale.set(size,size*(element==='water'?3.4:1.7),size);d.updateMatrix();o.setMatrixAt(i,d.matrix);});o.instanceMatrix.needsUpdate=true;});
  }
  vortex(x,z,radius) {
    const segments=140,positions=[],indices=[];
    for(let i=0;i<=segments;i++){const t=i/segments,a=t*TAU*2.4,r=.25+t*radius;for(const edge of[-1,1])positions.push(Math.sin(a)*(r+edge*.12),.15+Math.sin(t*Math.PI)*1.6,Math.cos(a)*(r+edge*.12));if(i<segments){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);
    const material=glow(0xc4faff,.8),o=new THREE.Mesh(geo,material);o.position.set(x,0,z);
    this.add(o,1.1,(_,t)=>{o.rotation.y=t*2.8;o.scale.setScalar(.25+.75*Math.sin(Math.min(1,t*1.6)*Math.PI*.5));material.opacity=(1-t)*.75;},true);
  }
  cast(event) {
    const { x, z, element = 'fire', radius = 5.8 } = event;
    this.flash = 1;this.punch = Math.max(this.punch,.055);this.light.position.set(x,3,z);this.light.color.setHex(ELEMENT_COLORS[element]);
    this.shake=Math.max(this.shake,element==='fire'?.29:element==='lightning'?.24:.17);
    this.sigil(x,z,radius,element,element==='fire'?1.35:1.1);
    this.shockShell(x,z,radius,element);
    this.shards(x,z,radius,element,element==='lightning'?9:18);
    if(element==='fire') {
      this.wave(x,z,radius,element,1.05);this.wave(x,z,radius*.8,element,.9,.12);this.wave(x,z,radius*.46,element,.75,.05);
      this.ring(x,z,radius,element,.75);this.ring(x,z,radius*.95,element,.8,.16);
      this.burstParticles(x,z,230,element,radius*.5,7.5,.2);
      for(const target of(event.targets||[]).slice(0,10))this.burstParticles(target.x,target.z,13,element,.2,2.5,.5);
    } else if(element==='water') {
      this.vortex(x,z,radius);
      for(let i=0;i<4;i++){this.wave(x,z,radius,element,1.2,i*.12);this.ring(x,z,radius,element,1.05,i*.12);}
      this.burstParticles(x,z,190,element,radius*.42,8.5,.4);
    } else {
      const targets=event.targets||[],chainedIds=new Set((event.chain||[]).map(edge=>edge.to.id));
      for(const target of targets.filter(target=>!chainedIds.has(target.id)))this.bolt([{x,y:1.35,z},{x:target.x,y:1.25,z:target.z}],.85);
      for(const edge of event.chain||[])this.bolt([{...edge.from,y:1.15},{...edge.to,y:1.15}],.9);
      for(const target of targets.slice(0,this.settings.quality==='low'?5:12)){
        this.bolt([{x:target.x+1,y:11,z:target.z-.6},{x:target.x,y:.12,z:target.z}],.85);
        this.ring(target.x,target.z,1.15,element,.7);
      }
      for(let i=0;i<8;i++){const a=i/8*TAU;this.bolt([{x,y:.2,z},{x:x+Math.sin(a)*radius,y:.18,z:z+Math.cos(a)*radius}],.7);}
      this.bolt([{x:x-.4,y:12,z:z+.3},{x,y:.2,z}],.8);
      this.ring(x,z,radius,element,.7);this.ring(x,z,radius*.65,element,.85,.12);this.burstParticles(x,z,165,element,radius*.75,5);
    }
  }
  event(e) {
    const x = e.x ?? 0, z = e.z ?? 0, element = e.element || 'fire';
    if (e.type === 'skill') this.cast(e);
    if (e.type === 'attack') {
      const arc = e.arc || 2.76, radius = e.range || 2.75, angle = e.facing || 0;
      const g = new THREE.RingGeometry(radius * .63, radius, 40, 1, 0, arc); const m = glow(ELEMENT_COLORS[element], .6); const o = new THREE.Mesh(g, m); o.position.set(x, .65, z); o.rotation.set(-Math.PI / 2, 0, angle - Math.PI / 2 - arc / 2);
      this.add(o, .23, (o, t) => { m.opacity = (1 - t) * .65; o.rotation.z = angle - Math.PI / 2 - arc / 2 + t * 1.3; o.position.y = .65 + Math.sin(t * Math.PI) * .18; }, true);
      this.burstParticles(x + Math.sin(angle) * 1.8, z + Math.cos(angle) * 1.8, 7, element, .25, 1.2, .7);
    }
    if (e.type === 'dash') { this.burstParticles(x, z, 23, element, .4, 1.8, .2); this.ring(x, z, 1.35, element, .28); }
    if (e.type === 'hit') this.burstParticles(x, z, e.critical ? 15 : 6, e.target === 'player' ? 'fire' : element, .25, 2, .7);
    if (e.type === 'kill') { this.burstParticles(x,z,e.elite?42:18,element,.4,3.6,.7);if(e.elite)this.shards(x,z,2,element,9); }
    if(e.type==='multikill'){this.punch=Math.max(this.punch,.065);this.shake=Math.max(this.shake,.2);this.ring(x,z,3.4,element,.6);}
    if(e.type==='poi'){this.sigil(x,z,2,'water',1.6);this.burstParticles(x,z,75,'water',1,2,1);}
    if (e.type === 'heal') { this.ring(x, z, 1.5, 'water', .7); this.burstParticles(x, z, 20, 'water', .7, .3, .5); }
    if (e.type === 'pickup') this.burstParticles(x, z, e.item === 'equipment' ? 32 : 5, element, .35, 1, .5);
    if (e.type === 'equipment' || e.type === 'equip') { this.ring(x, z, 1.6, element, .6); this.burstParticles(x, z, 32, element, .8, .3, .6); }
    if(e.type==='shield'){this.ring(x,z,1.1,'water',.3);this.burstParticles(x,z,10,'water',.8,1,.9);}
    if(e.type==='areapulse'&&element==='water')this.ring(x,z,e.radius,element,.55);
    if(e.type==='areapulse'&&element==='lightning'){this.ring(x,z,e.radius,element,.4);for(let i=0;i<5;i++){const a=i/5*TAU;this.bolt([{x,z,y:.13},{x:x+Math.sin(a)*e.radius,z:z+Math.cos(a)*e.radius,y:.2}],.35);}}
    if (e.type === 'chain' && e.targets?.length) this.bolt([{ x, z, y: 1 }, ...e.targets.map(t => ({ ...t, y: 1 }))], .3);
  }
  createField(area) {
    const fire = area.element === 'fire'; const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, opacity: { value: 1 }, color: { value: new THREE.Color(ELEMENT_COLORS[area.element]) }, fiery: { value: fire ? 1 : 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float time;uniform float opacity;uniform vec3 color;uniform float fiery;varying vec2 vP;void main(){float r=length(vP);float a=atan(vP.y,vP.x);float veins=pow(.5+.5*sin(a*18.+sin(r*26.-time*2.)*2.),9.)*pow(.5+.5*sin(r*31.+time),3.);float ripples=pow(.5+.5*sin(r*42.-time*4.+sin(a*8.)*.3),12.);float edge=smoothstep(1.,.78,r);float glow=mix(ripples*.2,veins*.45+.065,fiery);gl_FragColor=vec4(color*1.3,glow*edge*opacity);}`,
    });
    const o = new THREE.Mesh(discGeo, material); o.rotation.x = -Math.PI / 2; o.position.set(area.x, .05, area.z); o.scale.setScalar(area.radius); this.root.add(o); this.fields.set(area.id, { object: o, emitter: 0 });
  }
  update(game, dt) {
    this.time += dt; this.punch *= Math.exp(-dt*8); this.shake *= Math.exp(-dt * 10); this.flash = Math.max(0, this.flash - dt * 2.7); this.light.intensity = this.settings.quality === 'low' ? 0 : this.flash ** 2 * 95; this.light.visible = this.light.intensity > .1;
    for (let i = this.effects.length - 1; i >= 0; i--) { const e = this.effects[i]; e.life -= dt; if (e.life <= 0) { this.remove(e); this.effects.splice(i, 1); } else e.animate?.(e.object, 1 - e.life / e.duration); }
    const current = new Set(); for (const area of game.areas || []) { current.add(area.id); if (!this.fields.has(area.id)) this.createField(area); const field = this.fields.get(area.id); field.object.material.uniforms.time.value = this.time; field.object.material.uniforms.opacity.value = Math.min(1, area.remaining * 1.8); field.emitter += dt * (area.element === 'fire' ? 14 : 5); if (field.emitter >= 1) { this.burstParticles(area.x, area.z, Math.floor(field.emitter), area.element, area.radius * .9, .25, .06); field.emitter %= 1; } }
    for (const [id, field] of this.fields) if (!current.has(id)) { field.object.removeFromParent(); field.object.material.dispose(); this.fields.delete(id); }
    const shield = game.player.shield || 0; this.shield.visible = shield > 0; this.shield.position.set(game.player.x, 1.1, game.player.z); this.shield.material.uniforms.time.value = this.time; this.shield.material.uniforms.opacity.value = Math.min(1, shield / 15);
    for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.life -= dt; if (p.life <= 0) { this.particles[i] = this.particles[this.particles.length - 1]; this.particles.pop(); continue; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy += p.gravity * dt; p.vx *= Math.exp(-dt * 1.1); p.vz *= Math.exp(-dt * 1.1); if (p.y < .04) { p.y = .04; p.vy = Math.abs(p.vy) * .2; } }
    this.particles.length = Math.min(this.particles.length, this.budget, this.capacity);
    this.particles.forEach((p, i) => { const fade = Math.min(1, p.life / p.duration * 2); this.positions.set([p.x, p.y, p.z], i * 3); this.colors.set([p.color.r * fade, p.color.g * fade, p.color.b * fade], i * 3); this.sizes[i] = p.size * Math.sqrt(fade); });
    for (const name of ['position', 'color', 'size']) this.points.geometry.attributes[name].needsUpdate = true; this.points.geometry.setDrawRange(0, this.particles.length);
  }
  cameraOffset() { const s = this.settings.shake ? this.shake : 0; return new THREE.Vector3(Math.sin(this.time * 79) * s, Math.sin(this.time * 61) * s * .3, Math.cos(this.time * 83) * s); }
  clear() { for (const e of this.effects) this.remove(e); this.effects = []; this.particles = []; for (const f of this.fields.values()) { f.object.removeFromParent(); f.object.material.dispose(); } this.fields.clear(); this.shake = 0; this.flash = 0; this.punch = 0; this.shield.visible = false; this.points.geometry.setDrawRange(0, 0); }
}

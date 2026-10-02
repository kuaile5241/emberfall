import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ActorSystem, ACTOR_ASSETS } from './actors.js';
import { ElementEffects, ELEMENT_COLORS } from './element-effects.js';
import { SkillEffects } from './skill-effects.js';
import { equipmentById } from './content.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RuinWorld } from './environment.js';
import { WORLD } from './world.js';
const clamp=THREE.MathUtils.clamp;
const mesh=(g,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);return o;};
function random(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function disposeGenerated(o){if(o.geometry)o.geometry.dispose();if(o.material)for(const m of(Array.isArray(o.material)?o.material:[o.material]))m.dispose();}
/** The safe centre of a tide telegraph is a real hole, not a tinted disc. */
export function createTelegraphGeometry(mark){
 if(mark.type==='ring')return new THREE.RingGeometry(Math.max(0,Math.min(mark.innerRadius??0,mark.radius??8)),mark.radius??8,64);
 if(mark.type==='line')return new THREE.PlaneGeometry(mark.width||1,mark.length||8);
 return new THREE.CircleGeometry(mark.radius||2,48,mark.type==='cone'?(mark.angle||0)-Math.PI/2-(mark.arc||2)/2:0,mark.type==='cone'?(mark.arc||2):Math.PI*2);
}

function interestMarker(point){
 const mechanism=point.kind==='mechanism'||point.id==='sluice-wheel',story=point.kind==='story',color=mechanism?0x90c9f5:story?0xf2b95e:point.kind==='relic'?0xe8bc6c:0x8eafcc;
 const object=new THREE.Group();object.position.set(point.x,0,point.z);object.name=`Interest_${point.id}`;
 const stone=()=>new THREE.MeshStandardMaterial({color:0x404754,roughness:.88});
 const metal=()=>new THREE.MeshStandardMaterial({color:0xb19b74,metalness:.65,roughness:.42});
 object.add(mesh(new THREE.CylinderGeometry(mechanism?1.05:.85,mechanism?1.2:1,.36,12),stone(),0,.18,0));
 let core;
 if(mechanism){
  const wheel=new THREE.Group();wheel.name='wheel';wheel.position.y=1.25;object.add(wheel);
  const rim=mesh(new THREE.TorusGeometry(.86,.095,8,40),metal());wheel.add(rim);
  for(let i=0;i<4;i++){const spoke=mesh(new THREE.BoxGeometry(.12,1.7,.13),metal());spoke.rotation.z=i*Math.PI/4;wheel.add(spoke);}
  core=mesh(new THREE.OctahedronGeometry(.2,0),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.75}),0,1.25,.2);
  for(const x of[-.85,.85])object.add(mesh(new THREE.BoxGeometry(.15,.95,.2),stone(),x,.65,0));
 }else if(story){
  object.add(mesh(new THREE.CylinderGeometry(.55,.65,.8,8),stone(),0,.72,0));
  core=mesh(new THREE.TorusGeometry(.35,.075,8,30),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.7,metalness:.7,roughness:.32}),0,1.45,0);core.rotation.x=Math.PI/2;
  for(let i=0;i<6;i++){const a=i*Math.PI/3,rune=mesh(new THREE.BoxGeometry(.11,.35,.09),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.7}),Math.sin(a)*.42,1.45,Math.cos(a)*.42);rune.rotation.y=a;object.add(rune);}
 }else core=mesh(new THREE.OctahedronGeometry(.38,0),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.5,metalness:.45,roughness:.25}),0,1.4,0);
 core.name='relic';object.add(core);
 const halo=mesh(new THREE.TorusGeometry(mechanism?1.1:.59,.025,6,40),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.3,metalness:.8}),0,mechanism?1.25:1.4,0);halo.name='halo';halo.rotation.x=mechanism?0:.5;object.add(halo);
 const beam=mesh(new THREE.CylinderGeometry(.04,.34,3.7,16,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),0,1.9,0);beam.name='beam';object.add(beam);
 const ring=mesh(new THREE.RingGeometry(1.1,1.16,48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.7,depthWrite:false}),0,.04,0);ring.rotation.x=-Math.PI/2;ring.name='marker';object.add(ring);
 object.userData.mechanism=mechanism;object.userData.story=story;return object;
}

export class DungeonView {
 constructor(canvas){
  this.canvas=canvas;this.time=0;this.roomIndex=-1;this.models={};this.clips={};this.actors=new Map();this.effects=[];this.quality='high';this.settings={quality:'high',bloom:true,shake:true,effects:1};
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.setSize(innerWidth,innerHeight);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.22;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x151d20);this.scene.fog=new THREE.FogExp2(0x151d20,.019);
  this.camera=new THREE.OrthographicCamera(-18,18,11,-11,.1,160);this.offset=new THREE.Vector3(12.8,20,20);this.target=new THREE.Vector3(0,0,10);this.camera.position.copy(this.target).add(this.offset);this.camera.lookAt(this.target);
  this.hemi=new THREE.HemisphereLight(0xc3ced0,0x54463b,1.45);this.scene.add(this.hemi);
  this.sun=new THREE.DirectionalLight(0xd6d2b9,2.5);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:.1,far:80});this.sun.shadow.bias=-.00035;this.sun.shadow.normalBias=.045;this.scene.add(this.sun,this.sun.target);
  const rim=new THREE.DirectionalLight(0x679eb1,1.3);rim.position.set(4,12,-20);this.scene.add(rim);
  this.playerLight=new THREE.PointLight(0xffb567,7,7,2);this.scene.add(this.playerLight);
  this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),.3,.5,1.15);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
  this.environment=new RuinWorld(this.scene);this.elementFX=new ElementEffects(this.scene,this.camera);this.skillFX=new SkillEffects(this.scene,this.elementFX);this.dynamic=new THREE.Group();this.fx=new THREE.Group();this.warningGroup=new THREE.Group();this.pickups=new Map();this.warnings=new Map();this.bolts=new Map();this.interests=new Map();this.scene.add(this.dynamic,this.fx,this.warningGroup);
  this.ray=new THREE.Raycaster();this.ground=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.aim=new THREE.Vector3();this.createDust();this.resize();
 }
 async load(onProgress=()=>{}) {
  let n=0;const entries=Object.entries(ACTOR_ASSETS),loader=new GLTFLoader();
  await Promise.all([this.environment.load().then(()=>onProgress(++n,entries.length+1)),...entries.map(async([name,url])=>{const gltf=await loader.loadAsync(url);this.models[name]=gltf.scene;this.clips[name]=gltf.animations;onProgress(++n,entries.length+1);})]);
  this.actorSystem=new ActorSystem({models:this.models,clips:this.clips,parent:this.dynamic,camera:this.camera});this.actors=this.actorSystem.actors;this.setRoom(0);
 }
 createDust(){const R=random(17),p=[];for(let i=0;i<180;i++)p.push((R()-.5)*50,R()*7,(R()-.5)*50);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));this.dust=new THREE.Points(g,new THREE.PointsMaterial({color:0xb2b2a1,size:.025,transparent:true,opacity:.35,depthWrite:false}));this.scene.add(this.dust);}
 setRoom(index){this.roomIndex=index;this.snapCamera=true;this.actorSystem?.clear();this.elementFX.clear();this.skillFX?.clear();for(const map of[this.pickups,this.warnings,this.bolts,this.interests]){for(const o of map.values()){o.removeFromParent();o.traverse(disposeGenerated);}map.clear();}}
 setWorld(world=WORLD){
  const changed=this.environment.world!==world;
  this.environment.setWorld(world);this.setRoom(-1);
  if(!changed)return false;
  const aquatic=world.id==='aqueduct';this.scene.background.setHex(aquatic?0x151b28:0x151d20);this.scene.fog.color.copy(this.scene.background);this.playerLight.color.setHex(aquatic?0xb5d0f1:0xffb567);this.dust.material.color.setHex(aquatic?0x9db4d0:0xb2b2a1);
  return true;
 }
 effect(event){
  const tidal=event.kind?.startsWith('tide-');
  const visual={...event,x:event.x??this.lastPlayer?.x??0,z:event.z??this.lastPlayer?.z??0,element:tidal?'water':event.element??this.lastElement??'fire'};
  this.actorSystem?.event(visual);if(!(event.type==='skill'&&event.form))this.elementFX.event(visual);this.skillFX.event(visual);
  if(event.type==='enemyAttack'&&tidal){
   const radius=event.radius||3;
   if(event.kind==='tide-ring'){
    const material=new THREE.MeshBasicMaterial({color:0x70bdf3,side:THREE.DoubleSide,transparent:true,opacity:.38,depthWrite:false,blending:THREE.AdditiveBlending});
    const wave=mesh(new THREE.RingGeometry(event.innerRadius??3,radius,64),material,visual.x,.08,visual.z);wave.rotation.x=-Math.PI/2;
    this.elementFX.add(wave,.5,(_,t)=>{material.opacity=(1-t)*.38;},true);
    this.elementFX.ring(visual.x,visual.z,event.innerRadius??3,'water',.55);
   }
   this.elementFX.ring(visual.x,visual.z,radius,'water',.65);this.elementFX.burstParticles(visual.x,visual.z,35,'water',radius,2,.65);
  }
 }
 updateMaps(game) {
  for(const point of game.interestPoints||[]){
   let o=this.interests.get(point.id);
   if(!o){o=interestMarker(point);this.dynamic.add(o);this.interests.set(point.id,o);}
   o.visible=point.zoneIndex<=game.roomIndex;
   const core=o.getObjectByName('relic'),halo=o.getObjectByName('halo'),beam=o.getObjectByName('beam');
   core.visible=halo.visible=beam.visible=!point.completed;
   const enabled=point.available&&!point.completed;
   halo.material.emissiveIntensity=enabled?.8:.1;beam.material.opacity=enabled?.2:.04;
   if(o.userData.mechanism){const wheel=o.getObjectByName('wheel');wheel.rotation.z=point.completed?Math.PI/4:Math.sin(this.time*.7)*.07;}
   else{core.rotation.y=this.time*.7;core.position.y=1.4+Math.sin(this.time*2)*.14;halo.rotation.y=-this.time*.5;}
   o.getObjectByName('marker').material.opacity=point.completed?.12:enabled?.5+Math.sin(this.time*2)*.15:.18;
  }
  const alive=new Set();for(const d of game.drops){alive.add(d.id);let o=this.pickups.get(d.id);if(!o){if(d.type==='equipment'){
    o=new THREE.Group();const item=equipmentById(d.weaponId||d.equipmentId||d.itemId),color=ELEMENT_COLORS[item?.element]||0xe8b468;
    const core=mesh(new THREE.OctahedronGeometry(.22,0),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:1.1,metalness:.6,roughness:.3}),0,.5,0);core.name='core';o.add(core);
    const beam=mesh(new THREE.CylinderGeometry(.06,.24,2.3,16,1,true),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}),0,1.2,0);o.add(beam);
    const ring=mesh(new THREE.RingGeometry(.36,.43,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.7,depthWrite:false,side:THREE.DoubleSide}),0,.06,0);ring.rotation.x=-Math.PI/2;o.add(ring);
   }else{o=mesh(new THREE.OctahedronGeometry(d.type==='potion'?.19:.12,0),new THREE.MeshBasicMaterial({color:d.type==='potion'?0xdd5b43:d.type==='gold'?0xe8b468:0xa3dacd}));}
   this.dynamic.add(o);this.pickups.set(d.id,o);}
   if(d.type==='equipment'){o.position.set(d.x,0,d.z);const core=o.getObjectByName('core');core.rotation.y=this.time;core.position.y=.5+Math.sin(this.time*2)*.1;}else{o.position.set(d.x,.28+Math.sin(this.time*3+d.id)*.07,d.z);o.rotation.y=this.time;}}
  for(const[id,o]of this.pickups)if(!alive.has(id)){o.traverse(disposeGenerated);this.dynamic.remove(o);this.pickups.delete(id);}
  const warnKeep=new Set();for(const w of game.telegraphs){warnKeep.add(w.id);let o=this.warnings.get(w.id);if(!o){const m=new THREE.MeshBasicMaterial({color:w.type==='ring'?0x69b1ed:0xf46742,side:THREE.DoubleSide,transparent:true,opacity:.3,depthWrite:false});o=mesh(createTelegraphGeometry(w),m);o.rotation.x=-Math.PI/2;this.warningGroup.add(o);this.warnings.set(w.id,o);}const factor=1-(w.remaining/Math.max(w.duration,.01));o.position.set(w.x,.06,w.z);if(w.type==='line'){o.rotation.z=(w.angle||0);o.position.x+=Math.sin(w.angle||0)*(w.length||8)*.5;o.position.z+=Math.cos(w.angle||0)*(w.length||8)*.5;}o.material.opacity=.14+factor*.38+Math.sin(this.time*20)*.04;}
  for(const[id,o]of this.warnings)if(!warnKeep.has(id)){o.geometry.dispose();o.material.dispose();this.warningGroup.remove(o);this.warnings.delete(id);}
  const projectileKeep=new Set();for(const p of game.projectiles){projectileKeep.add(p.id);let o=this.bolts.get(p.id);if(!o){o=mesh(new THREE.IcosahedronGeometry(p.radius||.2,0),new THREE.MeshBasicMaterial({color:p.type==='water'?0x85c7fc:p.type==='fire'?0xf6a261:0x9ec5e0}));this.dynamic.add(o);this.bolts.set(p.id,o);}o.position.set(p.x,.65,p.z);o.rotation.set(this.time*3,this.time*4,0);}
  for(const[id,o]of this.bolts)if(!projectileKeep.has(id)){o.geometry.dispose();o.material.dispose();this.dynamic.remove(o);this.bolts.delete(id);}
 }
 render(game,dt,options={}){
  if(this.environment.world!==(game.world||WORLD))this.setWorld(game.world||WORLD);
  this.time+=dt;this.dt=dt;this.roomIndex=game.roomIndex;this.lastPlayer={x:game.player.x,z:game.player.z};this.lastElement=game.weapon.element;this.updateMaps(game);
  this.actorSystem.update(game,dt);
  if(game.world?.id==='aqueduct')for(const enemy of game.enemies){
   if(enemy.type!=='boss')continue;const actor=this.actors.get(enemy.id),u=actor?.userData;if(!u)continue;
   if(!u.aqueductTint){
    for(const entry of u.materials){entry.material.color?.multiply(new THREE.Color(0x8ab8f1));entry.baseEmissive?.setHex(0x20334c);entry.baseIntensity=Math.max(entry.baseIntensity,.15);}
    for(const child of u.generated||[])if(child.geometry?.type==='TorusGeometry'){child.material.color?.setHex(0xa6c9ed);child.material.emissive?.setHex(0x2557a2);}
    u.aqueductTint=true;
   }
   u.ring?.material.color.setHex(0x81bef5);
  }
  this.elementFX.update(game,dt);
  this.skillFX.update(game,dt);
  this.environment.update(game,dt);this.playerLight.position.set(game.player.x,2.6,game.player.z);this.dust.position.set(game.player.x,0,game.player.z);
  const desired=new THREE.Vector3(game.player.x,0,game.player.z);if(this.snapCamera){this.target.copy(desired);this.snapCamera=false;}else this.target.lerp(desired,1-Math.exp(-dt*5));this.camera.position.copy(this.target).add(this.offset).add(this.elementFX.cameraOffset());this.camera.lookAt(this.target);const zoom=1+(this.settings.shake?this.elementFX.punch:0);if(this.camera.zoom!==zoom){this.camera.zoom=zoom;this.camera.updateProjectionMatrix();}this.sun.position.copy(this.target).add(new THREE.Vector3(-15,26,10));this.sun.target.position.copy(this.target);this.sun.target.updateMatrixWorld();
  if(this.quality!=='low'&&this.settings.bloom)this.composer.render();else this.renderer.render(this.scene,this.camera);
 }
 screenPoint(x,z,y=1.5){const p=new THREE.Vector3(x,y,z).project(this.camera);return{x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight};}
 aimAt(clientX,clientY){this.ray.setFromCamera(new THREE.Vector2(clientX/innerWidth*2-1,1-clientY/innerHeight*2),this.camera);this.ray.ray.intersectPlane(this.ground,this.aim);return{x:this.aim.x,z:this.aim.z};}
 configure(options={}){const quality=['low','medium','high'].includes(options.quality)?options.quality:this.quality;this.settings={...this.settings,...options,quality,effects:clamp(Number(options.effects??this.settings.effects)||1,.5,1.5)};this.quality=quality;this.elementFX.configure(this.settings);this.skillFX.configure(this.settings);const ratio=quality==='high'?1.5:quality==='medium'?1.2:1;this.renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));this.composer.setPixelRatio(this.renderer.getPixelRatio());this.renderer.shadowMap.enabled=quality!=='low';const size=quality==='high'?2048:1024;if(this.sun.shadow.mapSize.x!==size){this.sun.shadow.mapSize.set(size,size);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;}this.bloom.strength=.38*this.settings.effects;this.resize();}
 setQuality(quality){this.configure({quality});}
 resize(){const aspect=innerWidth/innerHeight,h=aspect<1.3?24:21;this.camera.left=-h*aspect/2;this.camera.right=h*aspect/2;this.camera.top=h/2;this.camera.bottom=-h/2;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.composer.setSize(innerWidth,innerHeight);this.elementFX.resize(innerHeight,h);}
}

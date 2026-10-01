import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WORLD, isWalkable } from './world.js';

const mat=(color,roughness=.86,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
const rng=(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const box=new RoundedBoxGeometry(1,1,1,1,.07);
const cylinder=new THREE.CylinderGeometry(1,1,1,14);
const torchCup=new THREE.ConeGeometry(.24,.2,10);
const flameGeometry=new THREE.SphereGeometry(.13,7,7);
const rockGeometry=new THREE.IcosahedronGeometry(1,1);
const tmp=new THREE.Object3D();
const sharedGeometry=new Set([box,cylinder,torchCup,flameGeometry,rockGeometry]);
export class RuinWorld {
 constructor(scene){this.scene=scene;this.world=WORLD;this.root=new THREE.Group();scene.add(this.root);this.lamps=[];this.gates=[];this.chests=[];this.water=[];this.wheels=[];this.batches=new Map();this.generatedGeometry=new Set();this.generatedMaterials=new Set();this.instancedMeshes=[];this.time=0;}
 setWorld(world=WORLD,force=false){
  if(!force&&this.world===world){this.resetRun();return false;}
  this.world=world;
  if(!this.materials)return true;
  this.root.removeFromParent();
  // Cloned props keep their asset geometry/materials. Only our generated
  // geometry, one-off materials and per-instance buffers belong to this build.
  for(const mesh of this.instancedMeshes)mesh.dispose();
  for(const geometry of this.generatedGeometry)geometry.dispose();
  for(const material of this.generatedMaterials)material.dispose();
  this.generatedGeometry.clear();this.generatedMaterials.clear();this.instancedMeshes=[];
  this.root=new THREE.Group();this.root.name=`World_${world.id}`;this.scene.add(this.root);
  this.lamps=[];this.gates=[];this.chests=[];this.water=[];this.wheels=[];this.batches.clear();
  const aquatic=world.id==='aqueduct';
  const colors=aquatic?{floor:0x9ba9ba,wall:0x8997ab,ground:0x424c5b,dark:0x242b38,bronze:0x8a8578,cold:0x91c6ef}:{floor:0xb8b7a7,wall:0x999895,ground:0x717076,dark:0x292b31,bronze:0x876d3e,cold:0x9fbcca};
  for(const[key,color]of Object.entries(colors))this.materials[key].color.setHex(color);
  this.materials.fire.color.setHex(aquatic?0x9cc9ed:0xffb464);
  this.build();
  return true;
 }
 resetRun(){
  for(const chest of this.chests)chest.visible=false;
  for(const gate of this.gates)gate.group.visible=true;
  if(this.waypoint)this.waypoint.visible=false;
 }
 async load(){
  const loader=new THREE.TextureLoader();const packs=['monastery_stone_floor','stone_wall','rocks_ground_05'];this.tex={};
  await Promise.all(packs.map(async name=>{const maps={};await Promise.all(['diff','nor_gl','rough','ao'].map(async key=>{const t=await loader.loadAsync(`/assets/vendor/polyhaven/${name}/${name}_${key}_1k.jpg`);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;if(key==='diff')t.colorSpace=THREE.SRGBColorSpace;maps[key]=t;}));this.tex[name]=maps;}));
  this.props={};const gltfLoader=new GLTFLoader();await Promise.all(['crates_stacked','barrel_large_decorated','chest'].map(async name=>{const gltf=await gltfLoader.loadAsync(`/assets/vendor/kaykit/props/${name}.glb`);gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const m of(Array.isArray(o.material)?o.material:[o.material])){m.color?.set(0xa7a092);m.roughness=.83;}}});const bounds=new THREE.Box3().setFromObject(gltf.scene);const h=bounds.max.y-bounds.min.y;gltf.scene.position.y=-bounds.min.y;const holder=new THREE.Group();holder.add(gltf.scene);holder.scale.setScalar(1/h);this.props[name]=holder;}));
  this.materials={floor:this.pbr('monastery_stone_floor',0xb8b7a7),wall:this.pbr('stone_wall',0x929487),ground:this.pbr('rocks_ground_05',0x777a67),dark:mat(0x282c29),iron:mat(0x303536,.53,.65),bronze:mat(0x876d3e,.55,.6),bone:mat(0xada991),wood:mat(0x423329),cloth:mat(0x542326),fire:new THREE.MeshBasicMaterial({color:0xffb464}),cold:new THREE.MeshBasicMaterial({color:0x8ebbad})};
  this.materials.wall.normalScale.set(.7,.7);this.materials.floor.normalScale.set(.85,.85);
  this.setWorld(this.world,true);
 }
 pbr(name,color){const t=this.tex[name];return new THREE.MeshStandardMaterial({color,map:t.diff,normalMap:t.nor_gl,roughnessMap:t.rough,aoMap:t.ao,aoMapIntensity:.55,roughness:.92});}
 mesh(geometry,material,x,y,z,sx=1,sy=1,sz=1,ry=0,parent=this.root){
  if(!sharedGeometry.has(geometry))this.generatedGeometry.add(geometry);
  if(!Object.values(this.materials).includes(material))this.generatedMaterials.add(material);
  const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.y=ry;m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 block(material,x,y,z,sx,sy,sz,ry=0){return this.mesh(box,material,x,y,z,sx,sy,sz,ry);}
 instance(key,geo,material,x,y,z,sx,sy,sz,ry=0){if(!this.batches.has(key))this.batches.set(key,{geo,material,items:[]});this.batches.get(key).items.push({x,y,z,sx,sy,sz,ry});}
 flush(){for(const {geo,material,items}of this.batches.values()){const m=new THREE.InstancedMesh(geo,material,items.length);items.forEach((p,i)=>{tmp.position.set(p.x,p.y,p.z);tmp.rotation.set(0,p.ry,0);tmp.scale.set(p.sx,p.sy,p.sz);tmp.updateMatrix();m.setMatrixAt(i,tmp.matrix);});m.castShadow=true;m.receiveShadow=true;m.computeBoundingSphere();this.root.add(m);this.instancedMeshes.push(m);}this.batches.clear();}
 build(){
  const world=this.world,R=rng(world.id==='aqueduct'?81317:73991),M=this.materials,b=world.bounds;
  // Bedrock extends beyond the architecture; there is no floating board edge.
  const terrain=new THREE.PlaneGeometry(b.maxX-b.minX+80,b.maxZ-b.minZ+80,60,60);terrain.rotateX(-Math.PI/2);const p=terrain.attributes.position;
  const cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
  for(let i=0;i<p.count;i++){const x=p.getX(i)+cx,z=p.getZ(i)+cz;p.setY(i,isWalkable(x,z,0,world.walkable)?-.18:-.22+Math.sin(x*.14)*.3+Math.cos(z*.21)*.28);terrain.attributes.uv.setXY(i,x/7,z/7);}terrain.setAttribute('uv1',terrain.attributes.uv.clone());terrain.computeVertexNormals();this.mesh(terrain,M.ground,cx,0,cz).castShadow=false;
  // Tessellate the union once. Shared UVs remove seams between rooms and passages.
  const positions=[],uv=[];const xs=[...new Set(world.walkable.flatMap(r=>[r.minX,r.maxX]))].sort((a,b)=>a-b),zs=[...new Set(world.walkable.flatMap(r=>[r.minZ,r.maxZ]))].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)for(let j=1;j<zs.length;j++){const x0=xs[i-1],x1=xs[i],z0=zs[j-1],z1=zs[j];if(!isWalkable((x0+x1)/2,(z0+z1)/2,0,world.walkable))continue;for(const [x,z]of[[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]]){positions.push(x,0,z);uv.push(x/6,z/6);}}
  const floor=new THREE.BufferGeometry();floor.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));floor.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));floor.setAttribute('uv1',floor.attributes.uv.clone());floor.computeVertexNormals();const floorMesh=this.mesh(floor,M.floor,0,.01,0);floorMesh.castShadow=false;floorMesh.name='WalkableFloor';
  // Boundary walls follow the actual collision union, including all door openings.
  for(const edge of world.boundaries){const len=Math.hypot(edge.x2-edge.x1,edge.z2-edge.z1),count=Math.ceil(len/1.85),dx=(edge.x2-edge.x1)/count,dz=(edge.z2-edge.z1)/count,angle=Math.atan2(dx,dz),normal=edge.normal;
   for(let i=0;i<count;i++){const x=edge.x1+dx*(i+.5)+normal.x*.36,z=edge.z1+dz*(i+.5)+normal.z*.36,h=(normal.x*.54+normal.z*.84>.2?1.05:2.45)+R()*.4;this.instance('walls',box,M.wall,x,h/2-.05,z,.9,h,len/count+.025,angle);this.instance('caps',box,M.wall,x,h-.04,z,1.05,.17,len/count+.06,angle);if(i%4===0){this.pillar(x,z,h+.4,.7);this.torch(x-normal.x*.72,z-normal.z*.72,1.6);}
    if(i%2===0){let rx=x+normal.x*(3+R()*3),rz=z+normal.z*(3+R()*3),r=1.4+R()*1.8;if(!world.walkable.some(w=>Math.hypot(rx-Math.max(w.minX,Math.min(w.maxX,rx)),rz-Math.max(w.minZ,Math.min(w.maxZ,rz)))<r*1.6+.6)){this.instance('cliffs',rockGeometry,M.ground,rx,.1,rz,r,normal.x*.54+normal.z*.84>.2?1.1+R()*.8:2.6+R()*2,r*(.8+R()*.7),R()*6);}}
   }
  }
  for(const zone of world.zones)this.dressZone(zone,R);
  for(const corridor of world.corridors){for(let i=1;i<corridor.path.length;i++){const a=corridor.path[i-1],b=corridor.path[i],length=Math.hypot(b.x-a.x,b.z-a.z),along=Math.atan2(b.x-a.x,b.z-a.z);if(length>9){const x=(a.x+b.x)/2,z=(a.z+b.z)/2;this.arch(x,z,corridor.width,4.6,along);}
   if(world.id==='aqueduct')this.bridgeSegment(a,b,corridor.width);}
   const a=corridor.path[0],b=corridor.path[1],angle=Math.atan2(b.x-a.x,b.z-a.z),x=a.x+Math.sin(angle),z=a.z+Math.cos(angle);this.arch(x,z,corridor.width,4.8,angle);const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=angle;this.root.add(g);for(let n=-3;n<=3;n++)this.mesh(cylinder,M.iron,n*.82,1.7,0,.045,3.4,.045,0,g);for(const y of [.5,2.7])this.mesh(box,M.iron,0,y,0,5.8,.07,.12,0,g);this.gates.push({group:g,index:corridor.from});
  }
  // Side places have a physical reason to exist: graves and a bell foundry store.
  for(const alcove of world.alcoves){const{x,z}=alcove.center;if(alcove.id==='burial-garden'){for(let i=-1;i<=1;i++)for(const dz of [-3,2]){this.tomb(x+i*3,z+dz,R);this.deadTree(x+6,z-4,2.5);}}else{for(let i=0;i<6;i++)this.crate(x+(i%3)*2-3,z+Math.floor(i/3)*3-2,1.2,R()*1);this.bell(x+3,z+2,2.5);}}
  // Rubble is concentrated at edges, leaving walking lanes readable.
  for(let i=0;i<900;i++){const x=b.minX+R()*(b.maxX-b.minX),z=b.minZ+R()*(b.maxZ-b.minZ);if(isWalkable(x,z,.9,world.walkable)||!isWalkable(x,z,-.1,world.walkable)&&!world.boundaries.some(e=>Math.hypot(x-(e.x1+e.x2)/2,z-(e.z1+e.z2)/2)<4))continue;this.instance('rubble',rockGeometry,M.wall,x,.08,z,.18+R()*.4,.1+R()*.22,.18+R()*.5,R()*6);}
  this.flush();
  if(!this.lights)this.lights=Array.from({length:5},()=>{const l=new THREE.PointLight(0xffae67,20,10,2);this.scene.add(l);return l;});
  for(const light of this.lights){light.color.setHex(world.id==='aqueduct'?0x9fc9fa:0xffae67);light.visible=false;}
  const routeMat=new THREE.MeshBasicMaterial({color:0xd5bd85,transparent:true,opacity:.75,depthWrite:false});this.waypoint=this.mesh(new THREE.TorusGeometry(.35,.04,5,24),routeMat,0,.16,0);this.waypoint.rotation.x=-Math.PI/2;
 }
 pillar(x,z,h=4,r=.65){const M=this.materials;this.instance('pillarbase',box,M.wall,x,.18,z,r*1.65,.36,r*1.65);this.instance('pillarshafts',cylinder,M.wall,x,h/2,z,r*.63,h,r*.63);for(const y of [.5,h-.35])this.instance('pillarcaps',box,M.wall,x,y,z,r*1.45,.24,r*1.45);}
 arch(x,z,width=6,h=5,angle=0){const M=this.materials;const r=width/2;const side=(dx,y,dz=0)=>[x+Math.cos(angle)*dx+Math.sin(angle)*dz,y,z-Math.sin(angle)*dx+Math.cos(angle)*dz];for(const dx of[-r,r]){const q=side(dx,(h-r)/2);this.instance('archlegs',box,M.wall,...q,.65,h-r,.85,angle);}for(let i=0;i<14;i++){const a=(i+.5)/14*Math.PI,q=side(Math.cos(a)*r,h-r+Math.sin(a)*r);const block=this.mesh(box,M.wall,...q,.7,.78,.95,angle);block.rotation.z=a-Math.PI/2;}}
 torch(x,z,y=1.8){const M=this.materials;this.instance('torchbrackets',cylinder,M.iron,x,y-.4,z,.09,.65,.09);this.instance('torchcups',torchCup,M.bronze,x,y-.02,z,1,1,1);const flame=this.mesh(flameGeometry,M.fire,x,y+.22,z,.9,2.9,.9);flame.castShadow=false;this.lamps.push({x,y:y+.2,z,flame});}
 tomb(x,z,R){const M=this.materials;this.instance('tombs',box,M.wall,x,.32,z,1.35,.62,2.3,R()*.09);this.instance('tombtops',box,M.wall,x,.7,z,1.48,.16,2.45);this.instance('crossv',box,M.wall,x,1.25,z-.92,.2,1.15,.2);this.instance('crossh',box,M.wall,x,1.5,z-.92,.76,.17,.23);}
 prop(name,x,z,height,angle=0,parent=this.root){const o=this.props[name].clone(true);o.scale.multiplyScalar(height);o.position.set(x,0,z);o.rotation.y=angle;parent.add(o);return o;}
 crate(x,z,s=1,angle=0){this.prop('crates_stacked',x,z,s,angle);if(s>1.25)this.prop('barrel_large_decorated',x+1.1,z+.25,s*.65,angle);}
 deadTree(x,z,h){const M=this.materials;this.instance('treetrunks',cylinder,M.wood,x,h*.5,z,.13,h,.15,.2);for(const side of[-1,1]){const o=this.mesh(cylinder,M.wood,x+side*.5,h*.7,z,.065,h*.55,.065);o.rotation.z=side*.65;}}
 bell(x,z,h=7){const M=this.materials;const profile=[[1.8,0],[1.87,.15],[1.65,.28],[1.15,.9],[.91,1.7],[.8,2.1],[.25,2.3]].map(a=>new THREE.Vector2(...a));this.mesh(new THREE.LatheGeometry(profile,40),M.bronze,x,h,z);this.mesh(cylinder,M.iron,x,h+4,z,.06,4,.06);this.torch(x-2.5,z,h-4);this.torch(x+2.5,z,h-4);}
 waterStrip(x,z,width,length,angle=0){
  const material=new THREE.MeshStandardMaterial({color:0x42699b,metalness:.45,roughness:.24,transparent:true,opacity:.22,depthWrite:false});
  const strip=this.mesh(new THREE.PlaneGeometry(width,length),material,x,.018,z);strip.name='WaterGutter';strip.rotation.set(-Math.PI/2,angle,0,'YXZ');strip.castShadow=false;strip.receiveShadow=false;strip.renderOrder=0;this.water.push(strip);
  // Water remains lower than warnings and only occupies narrow side gutters.
  for(let i=0;i<Math.floor(length/3);i++){const ripple=this.mesh(new THREE.PlaneGeometry(width*.7,.035),new THREE.MeshBasicMaterial({color:0x9bc3ec,transparent:true,opacity:.15,depthWrite:false}),x+Math.sin(angle)*(-length/2+1.5+i*3),.021,z+Math.cos(angle)*(-length/2+1.5+i*3));ripple.rotation.set(-Math.PI/2,angle,0,'YXZ');ripple.castShadow=false;}
 }
 waterWheel(x,z,radius=2.4,angle=0){
  const M=this.materials,stand=new THREE.Group();stand.position.set(x,0,z);stand.rotation.y=angle;this.root.add(stand);
  for(const dx of[-radius-.35,radius+.35])this.mesh(box,M.wall,dx,radius*.6,0,.6,radius*1.2,1.1,0,stand);
  const wheel=new THREE.Group();wheel.position.y=radius+.35;stand.add(wheel);
  this.mesh(new THREE.TorusGeometry(radius,.16,8,48),M.iron,0,0,0,1,1,1,0,wheel);
  this.mesh(new THREE.TorusGeometry(radius*.84,.09,8,48),M.bronze,0,0,.05,1,1,1,0,wheel);
  for(let i=0;i<8;i++){const spoke=this.mesh(box,M.wood,0,0,0,.13,radius*1.9,.17,0,wheel);spoke.rotation.z=i*Math.PI/4;}
  for(let i=0;i<12;i++){const a=i*Math.PI/6,paddle=this.mesh(box,M.wood,Math.cos(a)*radius,Math.sin(a)*radius,0,.65,.18,.6,0,wheel);paddle.rotation.z=a;}
  const axle=this.mesh(cylinder,M.bronze,0,0,0,.24,.7,.24,0,wheel);axle.rotation.x=Math.PI/2;
  this.wheels.push(wheel);
 }
 bridgeSegment(a,b,width){
  const M=this.materials,length=Math.hypot(b.x-a.x,b.z-a.z),angle=Math.atan2(b.x-a.x,b.z-a.z),x=(a.x+b.x)/2,z=(a.z+b.z)/2;
  const bridge=new THREE.Group();bridge.position.set(x,0,z);bridge.rotation.y=angle;this.root.add(bridge);
  // The intact stone lane follows the collision route; broken buttresses sit
  // outside that lane, never imply a jump across a floor that is not walkable.
  for(const side of[-1,1])for(let i=0;i<=Math.floor(length/3);i++){
   const dz=-length/2+i*3;this.mesh(box,M.wall,side*(width/2+.5),.35,dz,.65,.7,1.1,0,bridge);
   if(i%2===0)this.mesh(box,M.wall,side*(width/2+1.2),-.08,dz,1.6,.25,1.2,side*.18,bridge);
  }
  for(const side of[-1,1])this.waterStrip(x+Math.cos(angle)*side*(width/2+.8),z-Math.sin(angle)*side*(width/2+.8),1.2,length,angle);
 }
 dressAqueduct(zone,R){
  const M=this.materials,{bounds:b,center:c}=zone,w=b.maxX-b.minX,d=b.maxZ-b.minZ;
  for(const side of[-1,1])this.waterStrip(c.x+side*(w/2-1),c.z,1.5,d-3);
  if(zone.id==='cistern'){
   // A covered reservoir at the entrance: vaulted masonry and visible drains.
   for(let i=0;i<3;i++){const z=b.minZ+4+i*7;this.arch(c.x,z,w*.65,8);for(const x of[b.minX+2,b.maxX-2])this.mesh(new THREE.CylinderGeometry(.7,.9,.22,16),M.iron,x,.06,z);}
   this.waterWheel(b.minX+4,b.minZ+4,1.9);this.crate(b.maxX-4,b.minZ+4,1.25,R());
  }
  if(zone.id==='sluice'){
   // A closed side outlet and chains identify a working sluice. The crossing
   // stays clear; its actual route gate is shared with collision progression.
   const z=b.minZ+4;this.arch(c.x,z,12,8);
   for(const x of[c.x-6,c.x+6]){this.mesh(cylinder,M.iron,x,3.3,z,.055,6.5,.055);this.pillar(x,z,7,.7);}
   for(let i=-4;i<=4;i++)this.mesh(cylinder,M.iron,b.minX-.65,1.6,c.z+i,.045,3.2,.045);
   this.waterWheel(b.maxX-4,c.z-5,2.6);this.crate(b.minX+3,c.z+7,1.3,R());
   for(const side of[-1,1])for(let i=0;i<4;i++)this.block(M.wall,c.x+side*(w/2-3),.12,c.z+i*3-4,2,.24,1.4,side*.18);
  }
  if(zone.id==='drowned-throne'){
   // Recessed tiers and drowned pews surround a clear, full-size boss arena.
   const disc=this.mesh(new THREE.CircleGeometry(8,64),M.dark,c.x,.024,c.z);disc.rotation.x=-Math.PI/2;
   for(const r of[7.5,8.2,10]){const rim=this.mesh(new THREE.TorusGeometry(r,.04,6,64),M.bronze,c.x,.035,c.z);rim.rotation.x=-Math.PI/2;}
   this.bell(c.x,b.minZ+4,4.6);this.arch(c.x,b.minZ+3,15,10);
   for(const side of[-1,1])for(let i=0;i<3;i++){this.block(M.wall,c.x+side*(w/2-4),.18,b.maxZ-6-i*6,3,.35,1.6);this.pillar(c.x+side*(w/2-3),b.maxZ-6-i*6,4.2,.55);}
  }
 }
 dressZone(zone,R){const M=this.materials,{bounds:b,center:c}=zone;const w=b.maxX-b.minX,d=b.maxZ-b.minZ;
  // Each wing retains the same masonry and materials but has a distinct purpose.
  for(const x of[b.minX+3,b.maxX-3])for(const z of[b.minZ+4,b.maxZ-4]){this.pillar(x,z,5.5,.8);this.torch(x,z,2);}
  if(zone.id==='gate'){for(let i=0;i<8;i++){const x=b.minX+4+(i%4)*6,z=b.minZ+3+Math.floor(i/4)*3;this.tomb(x,z,R);}this.arch(c.x,b.maxZ,9,7);for(const x of[-13,13])this.deadTree(x,11,5);this.crate(-13,6,1.3,.3);}
  if(zone.id==='crypt'){for(const x of[b.minX+2,b.maxX-2])for(let z=b.minZ+6;z<b.maxZ-3;z+=4)this.tomb(x,z,R);for(const z of[c.z-6,c.z+6])this.arch(c.x,z,16,9);}
  if(zone.id==='shrine'){this.block(M.wall,c.x,.2,b.minZ+4,10,.4,4);this.block(M.wall,c.x,1.1,b.minZ+4,5.2,1.8,1.7);for(let i=0;i<9;i++)this.torch(c.x-4+i,b.minZ+3,1.9);for(const x of[-1,1])for(let i=0;i<3;i++){this.block(M.wood,c.x+x*8,.55,c.z+5+i*3,5,.35,.65);}}
  if(zone.id==='forge'){for(const x of[b.minX+4,b.maxX-4]){this.block(M.dark,x,.6,c.z-10,4,1.2,5);this.mesh(new THREE.CylinderGeometry(1.6,2,2.8,16),M.iron,x,1.8,c.z-10);this.torch(x,c.z-10,3.3);for(let i=0;i<4;i++)this.crate(x,c.z+3+i*2,1.4,R());}for(const dx of[-8,8])this.bell(c.x+dx,b.minZ+4,4.8);}
  if(zone.id==='stairs'){for(let i=0;i<7;i++){const x=b.maxX-3,z=b.minZ+4+i*3;this.pillar(x,z,5+R()*3,.75);}this.arch(c.x,c.z,16,10);}
  if(zone.id==='throne'){const radius=7,disc=this.mesh(new THREE.CircleGeometry(radius,64),M.wall,c.x,.025,c.z);disc.rotation.x=-Math.PI/2;for(const r of[6.8,7.4]){const ring=this.mesh(new THREE.TorusGeometry(r,.025,4,64),M.bronze,c.x,.055,c.z);ring.rotation.x=-Math.PI/2;}this.bell(c.x,b.minZ+4,6.5);this.arch(c.x,b.minZ+3,13,11);}
  if(this.world.id==='aqueduct')this.dressAqueduct(zone,R);
  // Ground scarring is irregular instead of a one-metre square grid.
  for(let i=0;i<32;i++){const x=b.minX+R()*w,z=b.minZ+R()*d;if(i%5===0)this.instance('scatter',rockGeometry,M.ground,x,.035,z,.12+R()*.18,.045,.25+R()*.3,R()*6);}
  const chest=this.prop('chest',c.x,c.z+2,1);chest.visible=false;this.chests.push(chest);
 }
 update(game,dt){this.time+=dt;const p=game.player;
  for(const strip of this.water){strip.material.opacity=.2+Math.sin(this.time*1.7+strip.position.z)*.025;}
  for(const wheel of this.wheels)wheel.rotation.z=this.time*.14;
  const nearby=this.lamps.map(l=>({l,d:Math.hypot(l.x-p.x,l.z-p.z)})).sort((a,b)=>a.d-b.d).slice(0,this.lights.length);
  this.lights.forEach((light,i)=>{const n=nearby[i];light.visible=!!n&&n.d<35;if(n){light.position.set(n.l.x,n.l.y+.5,n.l.z);light.intensity=20+Math.sin(this.time*8+i)*2;}});
  for(const l of this.lamps){const d=Math.hypot(l.x-p.x,l.z-p.z);l.flame.visible=d<48;if(d<48){l.flame.scale.y=2.6+Math.sin(this.time*9+l.x)*.4;l.flame.rotation.y=this.time;}}
  for(const gate of this.gates){const open=gate.index<game.roomIndex||(gate.index===game.roomIndex&&game.roomRewardTaken);gate.group.visible=!open;}
  this.chests.forEach((chest,i)=>{chest.visible=i===game.roomIndex&&game.rewardReady;if(chest.visible&&game.chest)chest.position.set(game.chest.x,0,game.chest.z);});
  const point=game.nextWaypoint;this.waypoint.visible=!!point&&(game.roomCleared||point.kind==='objective');if(point){this.waypoint.position.set(point.x,.13,point.z);this.waypoint.material.opacity=.55+Math.sin(this.time*3)*.2;}
 }
}

"""Original elemental weapon designs for Emberfall; isolated Blender process."""
import bpy, math
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/assets/models-v3'
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name,color,metal=0,rough=.4,emission=None):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
    if emission:p.inputs['Emission Color'].default_value=(*emission,1);p.inputs['Emission Strength'].default_value=1.4
    return m
steel=material('Tempered dusk steel',(.09,.13,.17),.8,.27)
silver=material('Brushed moon silver',(.4,.52,.58),.85,.23)
gold=material('Old pale bronze',(.34,.24,.11),.8,.3)
leather=material('Bound charcoal leather',(.025,.028,.032),.05,.9)
water=material('Stillwater crystal',(.04,.48,.55),.25,.14,(.03,.63,.75))
lightning=material('Stormglass',(.16,.42,.62),.3,.16,(.23,.72,1))
ember=material('Living ember',(.34,.065,.022),.4,.22,(1,.17,.018))

def part(obj,mat,name):
    obj.name=name;obj.data.materials.append(mat);return obj
def cylinder(name,radius,depth,z,mat,vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=(0,0,z));return part(bpy.context.object,mat,name)
def ring(name,radius,minor,z,mat):
    bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,major_radius=radius,minor_radius=minor,location=(0,0,z));return part(bpy.context.object,mat,name)
def curve(name,coords,mat,thickness=.025):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=10;c.bevel_depth=thickness;c.bevel_resolution=2
    s=c.splines.new('BEZIER');s.bezier_points.add(len(coords)-1)
    for p,co in zip(s.bezier_points,coords):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);o.data.materials.append(mat);return o
def crystal(name,z,length,radius,mat):
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=radius,radius2=0,depth=length,location=(0,0,z));part(bpy.context.object,mat,name)
def start(name):
    group=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(group)
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[group.name]
    return group
def finish(group,name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in group.objects:obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_apply=False)
    # For the editable library only, spread completed collections horizontally.
    for obj in group.objects:obj.location.x+=(len(bpy.data.collections)-1)*2.0

g=start('Storm Lance')
cylinder('Long balanced haft',.035,1.95,.4,steel)
cylinder('Central bound grip',.049,.44,.04,leather)
for z in [-.54,-.2,.28,.72,1.05]:ring('Silver binding',.043,.009,z,silver)
crystal('Diamond storm lance tip',1.55,.75,.105,lightning)
crystal('Counterweight steel point',-.71,.22,.065,steel)
for sign in [-1,1]:curve('Swept lightning guard',[(0,0,1.12),(sign*.15,0,1.27),(sign*.10,0,1.42)],silver,.023)
ring('Focus collar',.078,.02,1.23,silver)
finish(g,'Lightning_Spear')

g=start('Tidebound Staff')
cylinder('Oceanwood staff',.043,1.8,.3,steel)
cylinder('Braided grip',.057,.38,.025,leather)
for z in [-.5,-.26,.27,.64,1.04]:ring('Engraved bronze bands',.055,.012,z,gold)
for sign in [-1,1]:curve('Crescent silver cradle',[(sign*.035,0,1.09),(sign*.19,0,1.26),(sign*.21,0,1.56),(sign*.1,0,1.76)],silver,.036)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.14,location=(0,0,1.48));part(bpy.context.object,water,'Suspended tidal heart')
for z in [1.31,1.66]:ring('Tidal focus ring',.155,.009,z,gold)
crystal('Tide crystal finial',-.67,.2,.071,water)
finish(g,'Water_Staff')

g=start('Ember Blade')
cylinder('Leather hilt',.054,.28,0,leather)
ring('Pommel iron rim',.059,.015,-.16,gold)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.065,location=(0,0,-.18));part(bpy.context.object,ember,'Ember pommel')
for sign in [-1,1]:curve('Swept forged guard',[(0,0,.16),(sign*.19,0,.13),(sign*.28,0,.19)],gold,.04)
verts=[(-.1,-.024,.22),(.1,-.024,.22),(-.12,-.024,.86),(.12,-.024,.86),(0,-.012,1.22),(-.1,.024,.22),(.1,.024,.22),(-.12,.024,.86),(.12,.024,.86),(0,.012,1.22)]
faces=[(0,1,3,2),(2,3,4),(5,7,8,6),(7,9,8),(0,5,6,1),(0,2,7,5),(1,6,8,3),(2,4,9,7),(3,8,9,4)]
m=bpy.data.meshes.new('Double edged blade mesh');m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new('Forged ember sword',m);bpy.context.collection.objects.link(o);o.data.materials.append(silver)
curve('Warm recessed fuller',[(0,-.026,.28),(0,-.026,.7),(0,-.018,1.07)],ember,.011)
finish(g,'Fire_Sword')

note=bpy.data.texts.new('README')
note.write('Original Emberfall V3 elemental weapon designs. Grip origin is (0,0,0). GLTF long axis is +Y, forward face +Z; Blender long axis +Z. Source files are in public/assets/models-v3. The asset collections are spread for editing; exported GLB files retain origin-centered grips. Materials use metal/roughness and emissive crystal accents. No third-party mesh geometry is used in these three weapon models.\n')
dest=ROOT/'blender/emberfall-v3-elemental-weapons.blend';dest.parent.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(dest),compress=True)
print('V3_WEAPONS_READY',str(dest))

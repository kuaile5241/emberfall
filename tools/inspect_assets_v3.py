"""Isolated Blender visual/mesh inspection; does not change the saved libraries."""
from pathlib import Path
import bpy, json
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/models-v3'
report = {}
def look(obj, point): obj.rotation_euler = (Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
def stage(look_at, camera_at, scale, width, height):
    scene = bpy.context.scene; scene.render.engine='CYCLES'; scene.cycles.samples=24; scene.cycles.use_denoising=True
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Preview World');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.07,.09,.12,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.6
    scene.view_settings.view_transform='AgX'
    for loc,power,color in [((4,-5,7),650,(1,.87,.73)),((-3,-1,4),450,(.58,.76,1)),((5,3,5),800,(.7,1,1))]:
        bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.size=5;o.data.color=color;look(o,look_at)
    bpy.ops.object.camera_add(location=camera_at);camera=bpy.context.object;look(camera,look_at);camera.data.type='ORTHO';camera.data.ortho_scale=scale;scene.camera=camera
    bpy.ops.mesh.primitive_plane_add(size=100,location=(0,0,-.85));o=bpy.context.object;m=bpy.data.materials.new('Slate');m.diffuse_color=(.065,.08,.1,1);o.data.materials.append(m)
    return scene
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'blender/emberfall-v3-elemental-weapons.blend'))
report['weapon_library']={'objects':len(bpy.data.objects),'collections':[c.name for c in bpy.data.collections], 'materials':[m.name for m in bpy.data.materials]}
# Collections are spread in the editable source; this is the same geometry as the shipped GLBs.
scene=stage((2,0,.6),(2,-9,3.1),7.8,1560,800)
scene.render.filepath=str(OUT/'elemental-weapons-inspection.png');bpy.ops.render.render(write_still=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'Mage.glb'))
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE')
rig.animation_data_create()
for track in rig.animation_data.nla_tracks:track.mute=True
idle=next(a for a in bpy.data.actions if a.name=='Idle');rig.animation_data.action=idle
if hasattr(idle,'slots') and len(idle.slots):rig.animation_data.action_slot=idle.slots[0]
for obj in bpy.context.scene.objects:
    if obj.type=='MESH' and not obj.name.startswith('Mage_'):obj.hide_render=True
bpy.context.scene.frame_set(8);bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get();points=[]
for obj in bpy.context.scene.objects:
    if obj.type!='MESH' or obj.hide_render:continue
    evaluated=obj.evaluated_get(deps);m=evaluated.to_mesh();points.extend(evaluated.matrix_world@v.co for v in m.vertices);evaluated.to_mesh_clear()
report['mage']={'height_idle':max(p.z for p in points)-min(p.z for p in points), 'animation_count':len(bpy.data.actions),'bones':[b.name for b in rig.data.bones], 'visible_meshes':[o.name for o in bpy.context.scene.objects if o.type=='MESH' and not o.hide_render], 'forward_gltf':'+Z','up_gltf':'+Y'}
scene=stage((0,0,1.4),(3,-7,3.4),3.8,760,880);scene.render.filepath=str(OUT/'mage-inspection.png');bpy.ops.render.render(write_still=True)
(OUT/'inspection-v3.json').write_text(json.dumps(report,indent=2)+'\n');print('V3_INSPECTION',json.dumps(report),flush=True)

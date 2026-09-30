"""Isolated Blender inspection/render of imported author assets; no game edits."""
from pathlib import Path
import bpy
import json
import math
import struct
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
DIR = ROOT / 'public/assets/vendor/kaykit'
HIDE = {'Knight': {'1H_Sword_Offhand', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword'},
        'Rogue_Hooded': {'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'}}
report = []

def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

for name in ['Knight', 'Skeleton_Warrior', 'Skeleton_Mage', 'Rogue_Hooded']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    raw = (DIR / f'{name}.glb').read_bytes()
    gltf = json.loads(raw[20:20 + struct.unpack_from('<I', raw, 12)[0]])
    declared_meshes = {node['name'] for node in gltf['nodes'] if 'mesh' in node}
    bpy.ops.import_scene.gltf(filepath=str(DIR / f'{name}.glb'))
    rig = next(obj for obj in bpy.data.objects if obj.type == 'ARMATURE')
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks: track.mute = True
    idle = next(action for action in bpy.data.actions if action.name == 'Idle' or action.name.endswith('|Idle'))
    rig.animation_data.action = idle
    if hasattr(idle, 'slots') and len(idle.slots): rig.animation_data.action_slot = idle.slots[0]
    for obj in bpy.context.scene.objects:
        if obj.name in HIDE.get(name, set()) or (obj.type == 'MESH' and obj.name not in declared_meshes): obj.hide_render = True
    bpy.context.scene.frame_set(8)
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH' and not obj.hide_render]
    coords = []
    for obj in mesh_objects:
        evaluated = obj.evaluated_get(deps)
        mesh = evaluated.to_mesh()
        coords.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    bounds = {'min': [min(p[i] for p in coords) for i in range(3)], 'max': [max(p[i] for p in coords) for i in range(3)]}
    height = bounds['max'][2] - bounds['min'][2]
    eye_positions = []
    for obj in mesh_objects:
        if 'Eyes' in obj.name:
            evaluated = obj.evaluated_get(deps)
            mesh = evaluated.to_mesh()
            points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
            eye_positions = [sum(p[i] for p in points) / len(points) for i in range(3)]
            evaluated.to_mesh_clear()
    record = {'asset': name, 'blender_version': bpy.app.version_string, 'animation': idle.name, 'frame': 8,
              'fps': bpy.context.scene.render.fps, 'visible_meshes': [obj.name for obj in mesh_objects],
              'hidden_meshes': list(HIDE.get(name, [])), 'blender_world_bounds': bounds, 'height': height,
              'eyes_center_blender': eye_positions,
              'bones': [bone.name for bone in rig.data.bones]}
    report.append(record)
    print('INSPECTION', json.dumps(record), flush=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Inspection World')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.12, .14, .17, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .6
    scene.view_settings.view_transform = 'AgX'
    for position, energy, size, color in [((3, -4, 6), 450, 5, (1, .85, .68)), ((-4, -2, 3), 260, 4, (.56, .7, 1)), ((1, 4, 5), 500, 3, (.9, 1, 1))]:
        bpy.ops.object.light_add(type='AREA', location=position)
        lamp = bpy.context.object; lamp.data.energy = energy; lamp.data.shape = 'DISK'; lamp.data.size = size; lamp.data.color = color
        look_at(lamp, (0, 0, height * .55))
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, bounds['min'][2] - .015))
    ground = bpy.context.object
    material = bpy.data.materials.new('Preview Ground'); material.diffuse_color = (.1, .115, .13, 1); ground.data.materials.append(material)
    bpy.ops.object.camera_add(location=(3, -6, height * .65 + 1.1))
    camera = bpy.context.object; look_at(camera, (0, 0, height * .52))
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = height * 1.4
    scene.camera = camera
    scene.render.filepath = str(DIR / f'{name}-inspection.png')
    bpy.ops.render.render(write_still=True)

(DIR / 'blender-inspection.json').write_text(json.dumps(report, indent=2) + '\n')

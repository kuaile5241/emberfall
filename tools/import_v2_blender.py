"""Build an editable author-asset library; preserve all rigs/actions and pack images."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'public/assets/vendor/kaykit'
OUT = ROOT / 'blender/emberfall-v2-characters.blend'
bpy.ops.wm.read_factory_settings(use_empty=True)

def collection(name):
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result

def add_asset(path, group, location, hide=()):
    objects_before = set(bpy.data.objects)
    actions_before = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = set(bpy.data.objects) - objects_before
    actions = set(bpy.data.actions) - actions_before
    for obj in objects:
        for old in list(obj.users_collection): old.objects.unlink(obj)
        group.objects.link(obj)
        if obj.name in hide or obj.name.startswith('Icosphere'):
            obj.hide_render = True
            obj.hide_set(True)
        if obj.parent not in objects and not obj.name.startswith('Icosphere'):
            obj.location += Vector(location)
    for rig in [obj for obj in objects if obj.type == 'ARMATURE']:
        rig.animation_data_create()
        for track in rig.animation_data.nla_tracks: track.mute = True
        idle = next((action for action in actions if action.name.split('.')[0] == 'Idle'), None)
        if idle:
            rig.animation_data.action = idle
            if hasattr(idle, 'slots') and len(idle.slots): rig.animation_data.action_slot = idle.slots[0]
    for action in actions:
        action.use_fake_user = True
        action.name = f'{path.stem}|{action.name}'
    return objects

characters = [('Knight', {'1H_Sword_Offhand', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield', '2H_Sword'}),
              ('Skeleton_Warrior', set()), ('Skeleton_Mage', set()),
              ('Rogue_Hooded', {'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable'})]
for index, (name, hidden) in enumerate(characters):
    add_asset(ASSETS / f'{name}.glb', collection(f'01 Character {index+1} - {name}'), ((index-1.5)*3.3, 0, 0), hidden)

weapons = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Shield_Large_A']
for index, name in enumerate(weapons):
    add_asset(ASSETS / f'{name}.glb', collection(f'02 Weapon {index+1} - {name}'), ((index-1.5)*2.2, 4, 0))

props = ['barrel_large_decorated', 'crates_stacked', 'pillar_decorated', 'wall_arched', 'torch_mounted', 'candle_triple', 'chest']
for index, name in enumerate(props):
    add_asset(ASSETS / 'props' / f'{name}.glb', collection(f'03 Prop {index+1} - {name}'), ((index-3)*2.7, 8, 0))

stage = collection('00 Inspection Stage')
def stage_object(obj):
    for old in list(obj.users_collection): old.objects.unlink(obj)
    stage.objects.link(obj)

def look_at(obj, point):
    obj.rotation_euler = (Vector(point)-obj.location).to_track_quat('-Z', 'Y').to_euler()

bpy.ops.mesh.primitive_plane_add(size=60)
floor = bpy.context.object; floor.name = 'Inspection Floor'; floor.location.z = -.025
material = bpy.data.materials.new('Inspection Charcoal'); material.diffuse_color=(.1,.13,.15,1); floor.data.materials.append(material)
stage_object(floor)
for location,energy,color in [((2,-5,11),1800,(1,.84,.66)),((-8,4,8),1500,(.55,.7,1)),((6,12,9),1900,(1,.95,.85))]:
    bpy.ops.object.light_add(type='AREA',location=location)
    lamp=bpy.context.object;lamp.data.energy=energy;lamp.data.size=9;lamp.data.color=color;look_at(lamp,(0,3,1));stage_object(lamp)
bpy.ops.object.camera_add(location=(11,-20,18))
camera=bpy.context.object;camera.name='Asset Library Camera';camera.data.type='ORTHO';camera.data.ortho_scale=25;look_at(camera,(0,3.7,1));stage_object(camera)
scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.frame_start=1;scene.frame_end=90;scene.frame_set(8)
scene.world=bpy.data.worlds.new('Library World');scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.1,.13,.16,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.7
scene.view_settings.view_transform='AgX'
note=bpy.data.texts.new('README - CC0 Asset Library')
note.write('Emberfall V2 editable asset library\n\nAuthor: Kay Lousberg / KayKit Game Assets. CC0 1.0.\nOriginal author geometry and rigs preserved. All images packed. No existing project file overwritten.\n\nCollections 01 contain four characters in Idle. Select a rig and use Action Editor to select any Character|Action clip. All imported clips are preserved with fake users and muted NLA strips.\nCollections 02 contain separate skeleton weapons. Attach to handslot.r or handslot.l bones when integrating.\nCollections 03 contain seven dungeon props.\nCollection 00 is an inspection-only floor/light/camera stage.\n\nIn GLTF: up +Y, forward +Z. In this Blender import: up +Z, forward -Y.\nKnight hidden alternatives: offhand sword, three unused shields, two-handed sword. Skeletons have no built-in weapons.\n\nLicenses and fixed source commits: ../public/assets/vendor/manifest-v2.json and kaykit/LICENSE-*.txt, kaykit/props/LICENSE.txt.\nResearch and integration notes: ../docs/asset-research-v2.md\n')
for image in bpy.data.images:
    if image.source == 'FILE':
        try: image.pack()
        except RuntimeError: pass
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_distance=22
            area.spaces.active.region_3d.view_location=(0,3.5,1)
            area.spaces.active.region_3d.view_rotation=camera.rotation_euler.to_quaternion()
            area.spaces.active.shading.type='MATERIAL'
OUT.parent.mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True)
print('SAVED_LIBRARY',OUT,OUT.stat().st_size,'objects',len(bpy.data.objects),'actions',len(bpy.data.actions))

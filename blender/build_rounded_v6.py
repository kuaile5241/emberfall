"""Round the shipped CC0 KayKit rigs in an isolated Blender process.

The original meshes, skeletons and all authored actions stay intact. Geometry
modifiers are baked before the existing armature, so skin weights survive.
Run: Blender --background --python blender/build_rounded_v6.py
"""
import bpy, bmesh, json, math, sys, struct
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/models-v6'
OUT.mkdir(parents=True, exist_ok=True)
CONFIGS = [
    ('Knight', ROOT/'public/assets/vendor/kaykit/Knight.glb', 'Knight_'),
    ('Rogue_Hooded', ROOT/'public/assets/vendor/kaykit/Rogue_Hooded.glb', 'Rogue_'),
    ('Mage', ROOT/'public/assets/models-v3/Mage.glb', 'Mage_'),
]
ALL_CONFIGS = list(CONFIGS)
args = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if args: CONFIGS = [item for item in CONFIGS if item[0] in args]

def activate(obj):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

def bake_modifier(obj, modifier):
    # Keep geometry modifiers before the armature. Applying them here carries
    # Blender's interpolated vertex groups into the exported skin.
    activate(obj)
    bpy.ops.object.modifier_move_up(modifier=modifier.name)
    bpy.ops.object.modifier_apply(modifier=modifier.name)

def atlas_to_vertex_colors(obj, shared_material, images):
    # KayKit's atlas is a set of color gradients, not detailed painted faces.
    # Sampling its authored UVs before subdivision prevents bevel/subdivision
    # from sampling a neighbouring swatch (pink hats or flesh-colored helmets).
    source = obj.active_material
    image = next(node.image for node in source.node_tree.nodes
                 if node.type == 'TEX_IMAGE' and node.image)
    if image.name not in images:
        images[image.name] = (image.size[0], image.size[1], list(image.pixels))
    width, height, pixels = images[image.name]
    uv = obj.data.uv_layers.active.data
    colors = obj.data.color_attributes.new(name='RoundedColor', type='BYTE_COLOR', domain='CORNER')
    for index, loop in enumerate(uv):
        x = min(width - 1, max(0, int(loop.uv.x * width)))
        y = min(height - 1, max(0, int(loop.uv.y * height)))
        start = (y * width + x) * 4
        colors.data[index].color_srgb = tuple(pixels[start:start+4])
    obj.data.color_attributes.active_color = colors
    obj.data.materials.clear();obj.data.materials.append(shared_material)

def round_mesh(obj, kind):
    before = len(obj.data.vertices)
    # glTF splits vertices at UV/normal boundaries. Rejoin positions without
    # losing loop UVs; dissolve coplanar triangle diagonals for clean rounding.
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=.00001)
    bmesh.ops.dissolve_limit(bm, angle_limit=.012, use_dissolve_boundaries=False,
                           verts=list(bm.verts), edges=list(bm.edges), delimit={'UV'})
    bmesh.ops.join_triangles(bm, faces=list(bm.faces), angle_face_threshold=.6,
                            angle_shape_threshold=.6, cmp_uvs=True)
    bm.to_mesh(obj.data); bm.free(); obj.data.update()

    if 'Head' in obj.name or 'Helmet' in obj.name or 'Hat' in obj.name:
        # A deliberately larger, wider head; neck attachment does not move.
        pivot = Vector((0, 0, 1.35)); to_world=obj.matrix_world.copy(); to_local=to_world.inverted()
        for vertex in obj.data.vertices:
            p = to_world @ vertex.co - pivot
            vertex.co = to_local @ (pivot + Vector((p.x * 1.12, p.y * 1.10, p.z * 1.055)))
        if 'Helmet' in obj.name:
            # Extra shell clearance: subdividing a helmet shrinks its crown
            # more than the enclosed head, even when both use the same scale.
            for vertex in obj.data.vertices:
                p = to_world @ vertex.co - pivot
                vertex.co = to_local @ (pivot + Vector((p.x * 1.025, p.y * 1.025, p.z * 1.035)))
    if 'Body' in obj.name:
        for vertex in obj.data.vertices:
            vertex.co.x *= 1.04
            vertex.co.y *= 1.035

    bevel = obj.modifiers.new('Soft handmade edges', 'BEVEL')
    bevel.width = .018 if 'Cape' in obj.name else .022
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'; bevel.angle_limit = .64
    bevel.use_clamp_overlap = True
    bake_modifier(obj, bevel)

    if any(part in obj.name for part in ['Head', 'Helmet', 'Hat', 'Arm', 'Leg', 'Cape']):
        subdiv = obj.modifiers.new('Rounded silhouette', 'SUBSURF')
        subdiv.subdivision_type = 'CATMULL_CLARK'
        subdiv.levels = 1; subdiv.render_levels = 1
        subdiv.uv_smooth = 'PRESERVE_BOUNDARIES'
        bake_modifier(obj, subdiv)
    for polygon in obj.data.polygons: polygon.use_smooth = True
    return {'name': obj.name, 'vertices_before': before,
            'vertices_after': len(obj.data.vertices), 'polygons': len(obj.data.polygons)}

def material(name, color, rough=.65, metal=0, emission=None):
    mat = bpy.data.materials.new(name); mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emission:
        p.inputs['Emission Color'].default_value = (*emission, 1)
        p.inputs['Emission Strength'].default_value = .55
    return mat

def badge(rig, prefix, kind):
    """A round enamel clasp genuinely bound to the chest, not a screen icon."""
    colors = {'Knight': (.85,.36,.20), 'Rogue_Hooded': (.29,.61,.63), 'Mage': (.30,.56,.83)}
    mats = [material(prefix+'Honey brass', (.57,.36,.13), .33, .7),
            material(prefix+'Element enamel', colors[kind], .28, .1, colors[kind])]
    for index, (radius, depth) in enumerate([(.075,.030),(.049,.040)]):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=1,
            location=(0, -.30 if index == 0 else -.321, 1.05))
        obj = bpy.context.object; obj.name = prefix+('Clasp_Rim' if index == 0 else 'Clasp_Gem')
        obj.scale=(radius,depth,radius); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
        obj.data.materials.append(mats[index]); obj.parent=rig
        vg = obj.vertex_groups.new(name='chest'); vg.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        armature=obj.modifiers.new('Original chest rig','ARMATURE'); armature.object=rig
        for p in obj.data.polygons: p.use_smooth=True

def rounded_mage_hat(rig):
    """Original round brim and gently bent crown, bound to the existing head."""
    old=bpy.data.objects.get('Mage_Hat')
    if old: bpy.data.objects.remove(old,do_unlink=True)
    purple=material('Mage_Moon felt',(.27,.24,.46),.78)
    brim=material('Mage_Lavender felt',(.34,.30,.53),.77)
    band=material('Mage_Honey leather',(.46,.25,.10),.8)
    brass=material('Mage_Brass hat clasp',(.63,.44,.19),.38,.62)
    def bind(obj,name,mat):
        obj.name=name;obj.data.materials.append(mat);obj.parent=rig
        vg=obj.vertex_groups.new(name='head');vg.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        modifier=obj.modifiers.new('Original head rig','ARMATURE');modifier.object=rig
        for p in obj.data.polygons:p.use_smooth=True
        return obj
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=16,radius=1,location=(0,.03,1.97))
    obj=bpy.context.object;obj.scale=(1.02,.83,.08)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bind(obj,'Mage_Hat',brim)
    profile=[(2.0,.515,0),(2.10,.50,0),(2.24,.44,-.012),(2.44,.345,-.025),
             (2.65,.24,-.045),(2.82,.135,-.07),(2.94,.058,-.12),(2.97,.018,-.19)]
    count=32;vertices=[];faces=[]
    for z,radius,offset in profile:
        vertices.extend((math.cos(i*math.tau/count)*radius+offset,
                         math.sin(i*math.tau/count)*radius+.03,z) for i in range(count))
    for row in range(len(profile)-1):
        for i in range(count):
            j=(i+1)%count;faces.append((row*count+i,row*count+j,(row+1)*count+j,(row+1)*count+i))
    faces.extend([tuple(reversed(range(count))),tuple((len(profile)-1)*count+i for i in range(count))])
    mesh=bpy.data.meshes.new('Bent felt crown');mesh.from_pydata(vertices,[],faces);mesh.update()
    obj=bpy.data.objects.new('Mage_Hat_Crown',mesh);bpy.context.collection.objects.link(obj)
    smooth=obj.modifiers.new('Soft crown','SUBSURF');smooth.levels=1;smooth.render_levels=1
    bake_modifier(obj,smooth);bind(obj,'Mage_Hat_Crown',purple)
    bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=.498,radius2=.453,depth=.13,location=(-.007,.03,2.185))
    obj=bpy.context.object;edge=obj.modifiers.new('Band edge','BEVEL');edge.width=.012;edge.segments=3
    bake_modifier(obj,edge);bind(obj,'Mage_Hat_Band',band)
    bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=8,major_radius=.07,minor_radius=.013,
                                   location=(-.007,-.44,2.18),rotation=(math.pi/2,0,0))
    obj=bpy.context.object;obj.scale=(1.2,1,1);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    bind(obj,'Mage_Hat_Clasp',brass)

def look(obj, at):
    obj.rotation_euler = (Vector(at)-obj.location).to_track_quat('-Z','Y').to_euler()

def render_preview(kind, prefix, rig):
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks: track.mute=True
    idle = next(action for action in bpy.data.actions if action.name=='Idle')
    rig.animation_data.action=idle
    if hasattr(idle,'slots') and len(idle.slots): rig.animation_data.action_slot=idle.slots[0]
    scene=bpy.context.scene; scene.frame_set(8)
    for obj in scene.objects:
        if obj.type=='MESH': obj.hide_render=not obj.name.startswith(prefix)
    scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=720;scene.render.resolution_y=880;scene.render.resolution_percentage=100
    scene.world=bpy.data.worlds.new('Soft sage studio');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.11,.17,.16,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.45
    scene.view_settings.view_transform='AgX'
    for pos,power,color,size in [((-3,-4,6),500,(1,.84,.66),4),((3,-2,4),350,(.65,.84,.9),4),((1,4,5),650,(1,.72,.40),3)]:
        bpy.ops.object.light_add(type='AREA',location=pos);obj=bpy.context.object
        obj.data.energy=power;obj.data.color=color;obj.data.size=size;look(obj,(0,0,1.3))
    bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.015));obj=bpy.context.object
    obj.data.materials.append(material('Studio sage',(.065,.1,.09),1))
    bpy.ops.object.camera_add(location=(3,-7,3.2));cam=bpy.context.object
    cam.data.type='ORTHO';cam.data.ortho_scale=3.55 if kind!='Mage' else 3.9
    look(cam,(0,0,1.35));scene.camera=cam
    scene.render.filepath=str(OUT/(kind+'-rounded.png'));bpy.ops.render.render(write_still=True)

report=[]
for kind, source, prefix in CONFIGS:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))
    rig = next(obj for obj in bpy.data.objects if obj.type=='ARMATURE')
    # The import displays Idle frame 1. Return to bind pose before geometry work.
    if rig.animation_data:
        rig.animation_data.action=None
        for track in rig.animation_data.nla_tracks: track.mute=True
    rig.data.pose_position='REST';bpy.context.view_layer.update()
    meshes=[];images={}
    color_material=material(prefix+'Soft painted colors',(1,1,1),.66,.07 if kind=='Knight' else 0)
    vertex_node=color_material.node_tree.nodes.new('ShaderNodeVertexColor');vertex_node.layer_name='RoundedColor'
    color_material.node_tree.links.new(vertex_node.outputs['Color'],color_material.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH' and obj.name.startswith(prefix):
            atlas_to_vertex_colors(obj,color_material,images)
            meshes.append(round_mesh(obj,kind))
    for mat in bpy.data.materials:
        if not mat.use_nodes: continue
        p=mat.node_tree.nodes.get('Principled BSDF')
        if p:
            p.inputs['Roughness'].default_value=.66
            p.inputs['Metallic'].default_value=.07 if kind=='Knight' else 0
    badge(rig,prefix,kind)
    if kind=='Mage':rounded_mage_hat(rig)
    rig.data.pose_position='POSE'
    if rig.animation_data:
        for track in rig.animation_data.nla_tracks:track.mute=False
    bpy.context.scene.frame_set(1)
    # Each isolated library contains only its own 76 source actions.
    note=bpy.data.texts.new('README_Rounded_V6')
    note.write('KayKit CC0 rig and original animations retained. Emberfall edits: coplanar cleanup, three-segment bevels, Catmull-Clark silhouette subdivision, wider head/body, enameled chest clasps; Mage uses an original round brim/bent crown. Geometry was applied before the armature; source atlas is packed, sampled into vertex colors before geometry edits. Head geometry is scaled in world space to account for bone-parented helmets. Build script: blender/build_rounded_v6.py. Original provenance and CC0 license: public/assets/vendor/manifest-v2.json and public/assets/models-v3/Mage-source.json.\n')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'blender'/('emberfall-v6-'+kind+'.blend')),compress=True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/(kind+'.glb')),export_format='GLB',
        export_apply=False,export_animations=True,export_animation_mode='ACTIONS',
        export_skins=True,export_yup=True,export_cameras=False,export_lights=False,
        export_draco_mesh_compression_enable=False)
    report.append({'kind':kind,'source':str(source.relative_to(ROOT)),'meshes':meshes,
                   'actions':len(bpy.data.actions),'bytes':(OUT/(kind+'.glb')).stat().st_size})
    render_preview(kind,prefix,rig)
def shipped_mesh_counts(path):
    data=path.read_bytes();length=struct.unpack_from('<I',data,12)[0]
    gltf=json.loads(data[20:20+length]);counts={}
    for node in gltf['nodes']:
        if 'mesh' not in node:continue
        primitives=gltf['meshes'][node['mesh']]['primitives']
        counts[node['name']]={
            'vertices':sum(gltf['accessors'][part['attributes']['POSITION']]['count'] for part in primitives),
            'triangles':sum(gltf['accessors'][part['indices']]['count']//3 for part in primitives)}
    return counts

shipped_report=[]
for kind,source,prefix in ALL_CONFIGS:
    destination=OUT/(kind+'.glb')
    if not destination.exists():continue
    before=shipped_mesh_counts(source);after=shipped_mesh_counts(destination)
    shipped_report.append({'kind':kind,'source':str(source.relative_to(ROOT)),
        'count_scope':'Shipped glTF POSITION accessor and index counts, including normal/color attribute seam splits',
        'animation_count':76,'meshes':[{'name':name,'original':before.get(name),'rounded':counts,
            'generated_geometry':name not in before or (kind=='Mage' and name.startswith('Mage_Hat'))}
            for name,counts in after.items() if name.startswith(prefix)]})
(OUT/'geometry-report.json').write_text(json.dumps(shipped_report,indent=2)+'\n')
print('ROUNDED_V6_READY',json.dumps(report),flush=True)

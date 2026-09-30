"""Original Emberfall low-poly asset library.

Run with Blender 5.x --background --factory-startup --python build_assets.py.
All geometry and materials are authored here; no downloaded models/textures.
"""
import bpy
import bmesh
import json
import math
import os
import random
import struct
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'assets', 'models')
os.makedirs(OUT, exist_ok=True)
random.seed(17)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version = 0
for mat in list(bpy.data.materials):
    bpy.data.materials.remove(mat)


def material(name, color, metallic=0, rough=.75, emission=None, strength=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metallic
    p.inputs['Roughness'].default_value = rough
    if emission:
        p.inputs['Emission Color'].default_value = (*emission, 1)
        p.inputs['Emission Strength'].default_value = strength
    return m


M = {
    'stone': material('Basalt', (.12, .145, .175), rough=.92),
    'edge': material('AshStone', (.25, .28, .31), rough=.87),
    'dark': material('Obsidian', (.026, .032, .046), metallic=.2, rough=.64),
    'iron': material('ColdIron', (.12, .18, .24), metallic=.78, rough=.4),
    'steel': material('SilverSteel', (.46, .57, .62), metallic=.8, rough=.31),
    'bronze': material('AntiqueGold', (.47, .26, .095), metallic=.72, rough=.47),
    'gold': material('GiltEdges', (.83, .54, .18), metallic=.64, rough=.32),
    'bone': material('IvoryBone', (.73, .66, .49), metallic=.04, rough=.77),
    'ivory': material('AshenArmor', (.66, .69, .62), metallic=.45, rough=.44),
    'red': material('OxbloodCloth', (.28, .025, .045), rough=.95),
    'red_light': material('CrimsonFolds', (.46, .045, .07), rough=.88),
    'cloth': material('RavenCloth', (.042, .06, .075), rough=.96),
    'leather': material('CharredLeather', (.08, .055, .04), rough=.9),
    'wood': material('BurntOak', (.16, .08, .045), rough=.84),
    'tealcloth': material('SpectralCloth', (.03, .15, .16), rough=.9),
    'ember': material('EmberGlow', (1, .18, .018), rough=.4, emission=(1, .14, .008), strength=3),
    'fire': material('FireHeart', (1, .67, .16), rough=.4, emission=(1, .43, .04), strength=5),
    'teal': material('SpiritGlow', (.08, .82, .74), rough=.35, emission=(.035, 1, .82), strength=3),
    'purple': material('Amethyst', (.32, .1, .56), metallic=.25, rough=.3, emission=(.4, .07, .72), strength=1.15),
}


class Asset:
    def __init__(self, name):
        self.name = name
        self.root = bpy.data.objects.new(name + '_root', None)
        bpy.context.collection.objects.link(self.root)
        self.pivots = {}
        self.groups = {}
        self.pivot('body', (0, 0, 0))

    def pivot(self, name, pos, parent=None):
        o = bpy.data.objects.new(self.name + '_' + name, None)
        bpy.context.collection.objects.link(o)
        o.empty_display_type = 'PLAIN_AXES'
        o.empty_display_size = .15
        o.location = pos
        o.parent = self.root
        if parent:
            bpy.context.view_layer.update()
            world = o.matrix_world.copy()
            o.parent = self.pivots[parent]
            o.matrix_world = world
        self.pivots[name] = o
        self.groups[name] = []
        return o

    def add(self, obj, mat, part='body'):
        obj.data.materials.append(M[mat])
        self.groups[part].append(obj)
        return obj

    def finalize(self):
        for part, objects in self.groups.items():
            if not objects:
                continue
            bpy.ops.object.select_all(action='DESELECT')
            for o in objects:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objects[0]
            bpy.ops.object.join()
            o = bpy.context.object
            o.name = self.name + '_' + part + '_mesh'
            o.data.name = o.name + '_geometry'
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(o.data)
            bm.free()
            world = o.matrix_world.copy()
            o.parent = self.pivots[part]
            o.matrix_world = world
        bpy.context.view_layer.update()

    def descendants(self):
        return [self.root] + list(self.root.children_recursive)


def cube(a, pos, size, mat, part='body', bevel=0, rotation=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.object
    o.scale = size
    if rotation:
        o.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('HandCutEdges', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return a.add(o, mat, part)


def ico(a, pos, size, mat, part='body', subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=1, location=pos)
    o = bpy.context.object
    o.scale = size
    return a.add(o, mat, part)


def cone(a, pos, radius1, radius2, depth, mat, part='body', verts=8):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius1, radius2=radius2, depth=depth, location=pos)
    return a.add(bpy.context.object, mat, part)


def rod(a, start, end, radius, mat, part='body', r2=None, verts=8):
    direction = Vector(end) - Vector(start)
    o = cone(a, (Vector(start) + Vector(end)) / 2, radius, radius if r2 is None else r2,
             direction.length, mat, part, verts)
    o.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    return o


def mesh(a, vertices, faces, mat, part='body'):
    me = bpy.data.meshes.new(a.name + '_shaped')
    me.from_pydata(vertices, [], faces)
    me.update()
    ob = bpy.data.objects.new(a.name + '_shaped', me)
    bpy.context.collection.objects.link(ob)
    return a.add(ob, mat, part)


def poly_extrude(a, outline, y, depth, mat, part='body'):
    n = len(outline)
    v = [(x, y - depth / 2, z) for x, z in outline] + [(x, y + depth / 2, z) for x, z in outline]
    f = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    f += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    return mesh(a, v, f, mat, part)


def torus(a, pos, major, minor, mat, part='body', rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                   major_segments=12, minor_segments=4, location=pos)
    o = bpy.context.object
    if rotation:
        o.rotation_euler = rotation
    return a.add(o, mat, part)


def faceted_cloth(a, rings, mat, part, sides=10, ragged=False):
    # Each ring is (z, xRadius, yRadius, yCenter).
    vertices = []
    for ri, (z, rx, ry, cy) in enumerate(rings):
        for i in range(sides):
            th = 2 * math.pi * i / sides
            dz = (.09 if i % 2 else -.035) if ragged and ri == 0 else 0
            vertices.append((math.cos(th) * rx, cy + math.sin(th) * ry, z + dz))
    faces = []
    for r in range(len(rings) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            faces.append((r * sides + i, r * sides + j, (r + 1) * sides + j, (r + 1) * sides + i))
    faces += [tuple(reversed(range(sides))), tuple(range((len(rings) - 1) * sides, len(rings) * sides))]
    return mesh(a, vertices, faces, mat, part)


def cape(a, top, bottom, width_top, width_bottom, mat='red', part='cape'):
    zt, zb, yt, yb = top[0], bottom[0], top[1], bottom[1]
    v = []
    for row in range(3):
        t = row / 2
        w = width_top * (1-t) + width_bottom * t
        y = yt * (1-t) + yb * t
        z = zt * (1-t) + zb * t
        for i in range(5):
            x = (i / 4 - .5) * 2 * w
            fold = (.04 if i % 2 else -.02) * (.5 + t)
            v.append((x, y + fold, z + (0 if row < 2 else (.04 if i % 2 else 0))))
    f = [(r * 5 + i, r * 5 + i + 1, (r+1) * 5 + i + 1, (r+1) * 5 + i) for r in range(2) for i in range(4)]
    o = mesh(a, v, f, mat, part)
    mod = o.modifiers.new('ClothThickness', 'SOLIDIFY')
    mod.thickness = .018
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=mod.name)
    # Narrow gilt hem accents form clear readable graphics from isometric view.
    for x in [-1, 1]:
        rod(a, (x*width_top, yt, zt), (x*width_bottom, yb, zb), .017, 'bronze', part, verts=5)


def hood(a, z, scale=1, outer='cloth', glow='ember', part='head'):
    # Open-faced angular hood: silhouette shell, inner cavity, bright slitted eyes.
    poly_extrude(a, [(-.29*scale,z-.2*scale), (-.31*scale,z+.17*scale),
                    (-.18*scale,z+.36*scale), (0,z+.43*scale),
                    (.18*scale,z+.36*scale), (.31*scale,z+.17*scale), (.29*scale,z-.2*scale)],
                 .015*scale, .45*scale, outer, part)
    poly_extrude(a, [(-.205*scale,z-.14*scale), (-.21*scale,z+.14*scale),
                    (0,z+.30*scale), (.21*scale,z+.14*scale), (.205*scale,z-.14*scale)],
                 -.226*scale, .012*scale, 'dark', part)
    for side in [-1, 1]:
        cube(a, (side*.087*scale, -.24*scale, z+.055*scale), (.095*scale,.024*scale,.027*scale), glow, part,
             rotation=(0,side*-.13,0))


def leg(a, x, top, width=.17, armor='ivory', part='leg_l'):
    a.pivot(part, (x, 0, top))
    rod(a, (x, .015, top), (x, -.005, .5), width*.7, 'cloth', part, r2=width*.85)
    cube(a, (x,-.025,.42), (width*1.38,.22,.46), armor, part, .045)
    cube(a, (x,-.055,.65), (width*1.5,.27,.18), 'bronze', part, .03)
    cube(a, (x,-.115,.11), (width*1.65,.4,.22), 'dark', part, .045)
    cube(a, (x,-.285,.12), (width*1.42,.12,.1), armor, part, .022)


def player():
    a=Asset('player')
    a.pivot('head',(0,0,1.60))
    a.pivot('cape',(0,.16,1.58))
    leg(a,-.19,.91,part='leg_l')
    leg(a,.19,.91,part='leg_r')
    faceted_cloth(a,[(.72,.36,.21,0),(1.09,.28,.18,0)],'red','body',8)
    cube(a,(0,0,1.27),(.60,.33,.50),'cloth',bevel=.08)
    poly_extrude(a,[(-.32,1.48),(-.24,1.07),(0,1.00),(.24,1.07),(.32,1.48),(0,1.55)],-.15,.16,'ivory')
    cube(a,(0,-.255,1.27),(.04,.025,.37),'bronze')
    poly_extrude(a,[(-.085,1.28),(0,1.17),(.085,1.28),(0,1.41)],-.257,.04,'ember')
    cube(a,(0,-.01,1.02),(.61,.39,.12),'leather',bevel=.02)
    cube(a,(0,-.22,1.02),(.16,.045,.13),'gold',bevel=.02)
    for side,label in [(-1,'l'),(1,'r')]:
        part='arm_'+label
        a.pivot(part,(side*.37,0,1.46))
        ico(a,(side*.4,0,1.46),(.23,.25,.19),'ivory',part)
        cube(a,(side*.45,-.02,1.45),(.3,.35,.075),'bronze',part,.03)
        rod(a,(side*.4,0,1.4),(side*.56,-.04,1.14),.09,'cloth',part)
        cube(a,(side*.58,-.04,1.10),(.20,.22,.30),'ivory',part,.04,rotation=(0,-side*.17,0))
        ico(a,(side*.61,-.05,.93),(.115,.115,.12),'leather',part)
    hood(a,1.65,.87,'cloth','ember')
    cape(a,(1.58,.17),(.58,.41),.34,.46)
    a.pivot('weapon',(.62,-.11,.95),'arm_r')
    x=.63
    rod(a,(x,-.14,.93),(x,-.14,1.18),.045,'leather','weapon',verts=8)
    ico(a,(x,-.14,1.2),(.072,.065,.055),'bronze','weapon')
    poly_extrude(a,[(x-.22,.96),(x-.17,1.02),(x+.17,1.02),(x+.22,.96),(x+.13,.93),(x-.13,.93)],-.14,.08,'gold','weapon')
    poly_extrude(a,[(x-.105,.93),(x-.11,.32),(x,.015),(x+.11,.32),(x+.105,.93)],-.14,.06,'steel','weapon')
    poly_extrude(a,[(x-.028,.92),(x-.035,.28),(x,.075),(x+.035,.28),(x+.028,.92)],-.178,.018,'ember','weapon')
    return a


def skull(a,z,size=.22,part='head',glow='ember'):
    ico(a,(0,-.015,z),(size,size*.83,size*1.1),'bone',part,2)
    cube(a,(0,-size*.29,z-size*.70),(size*1.32,size*1.04,size*.46),'bone',part,.025)
    for s in [-1,1]:
        ico(a,(s*size*.4,-size*.72,z+size*.025),(size*.3,size*.13,size*.29),'dark',part)
        cube(a,(s*size*.4,-size*.815,z+size*.02),(size*.18,.015,size*.09),glow,part)
    poly_extrude(a,[(-size*.11,z-size*.24),(size*.11,z-size*.24),(0,z-size*.02)],-size*.85,.01,'dark',part)
    for t in [-1,0,1]:
        cube(a,(t*size*.26,-size*.78,z-size*.67),(.02,.018,size*.27),'dark',part)


def skeleton():
    a=Asset('skeleton')
    a.pivot('head',(0,0,1.47))
    skull(a,1.64,.21)
    rod(a,(0,0,.85),(0,0,1.44),.075,'bone')
    for i in range(4):
        z=1.13+i*.08
        w=.25-i*.025
        for s in [-1,1]:
            rod(a,(0,-.08,z),(s*w,-.10,z+.055),.036,'bone')
            rod(a,(s*w,-.10,z+.055),(s*(w+.015),.07,z+.08),.036,'bone')
    ico(a,(0,0,.93),(.26,.16,.14),'bone')
    for side,label in [(-1,'l'),(1,'r')]:
        p='leg_'+label
        a.pivot(p,(side*.13,0,.92))
        rod(a,(side*.13,0,.91),(side*.15,.02,.52),.063,'bone',p)
        ico(a,(side*.15,.02,.5),(.078,.078,.075),'bone',p)
        for dx in [-.035,.035]:
            rod(a,(side*.15+dx,.02,.46),(side*.18+dx,-.02,.13),.027,'bone',p)
        cube(a,(side*.18,-.075,.075),(.13,.26,.11),'bone',p,.025)
        p='arm_'+label
        a.pivot(p,(side*.3,0,1.4))
        ico(a,(side*.3,0,1.4),(.092,.105,.1),'bone',p)
        rod(a,(side*.32,0,1.36),(side*.39,-.025,1.08),.052,'bone',p)
        ico(a,(side*.39,-.025,1.08),(.065,.068,.063),'bone',p)
        rod(a,(side*.39,-.025,1.08),(side*.49,-.12,.9),.042,'bone',p)
        ico(a,(side*.49,-.12,.88),(.065,.058,.08),'bone',p)
    # Broken shoulder protection distinguishes this from a generic white stick figure.
    ico(a,(-.31,.01,1.44),(.20,.20,.13),'iron','arm_l')
    a.pivot('weapon',(.49,-.12,.9),'arm_r')
    rod(a,(.49,-.12,.83),(.49,-.12,1.08),.035,'wood','weapon')
    poly_extrude(a,[(.42,.9),(.40,.30),(.58,.21),(.69,.35),(.65,.93)],-.12,.06,'iron','weapon')
    poly_extrude(a,[(.63,.92),(.68,.35),(.58,.21),(.62,.41),(.60,.90)],-.155,.01,'steel','weapon')
    return a


def wraith():
    a=Asset('wraith')
    a.pivot('head',(0,0,1.62))
    a.pivot('cape',(0,.12,1.58))
    for side,label in [(-1,'l'),(1,'r')]:
        a.pivot('leg_'+label,(side*.12,0,.5))
    faceted_cloth(a,[(.08,.51,.34,.08),(.7,.31,.22,.02),(1.4,.25,.18,0),(1.54,.37,.23,0)],'tealcloth','body',10,True)
    faceted_cloth(a,[(.2,.52,.35,.08),(.28,.49,.33,.07)],'bronze','body',10)
    cube(a,(0,-.225,1.07),(.025,.014,.7),'teal')
    for side,label in [(-1,'l'),(1,'r')]:
        p='arm_'+label
        a.pivot(p,(side*.34,0,1.44))
        rod(a,(side*.34,0,1.44),(side*.58,-.14,1.03),.11,'tealcloth',p,r2=.17)
        torus(a,(side*.58,-.14,1.02),.14,.035,'bronze',p)
        ico(a,(side*.60,-.14,.94),(.065,.072,.13),'teal',p)
    hood(a,1.62,.96,'cloth','teal')
    cape(a,(1.55,.15),(.21,.4),.36,.61,'cloth')
    a.pivot('weapon',(.62,-.15,1.0),'arm_r')
    rod(a,(.65,-.16,.15),(.65,-.16,1.98),.044,'wood','weapon')
    for z in [.35,1.12,1.8]:
        cone(a,(.65,-.16,z),.07,.07,.065,'bronze','weapon')
    for side in [-1,1]:
        rod(a,(.65,-.16,1.82),(.65+side*.22,-.16,2.02),.044,'bronze','weapon')
        rod(a,(.65+side*.22,-.16,2.02),(.65+side*.16,-.16,2.20),.04,'bronze','weapon',r2=.015)
    ico(a,(.65,-.16,2.09),(.13,.11,.23),'teal','weapon')
    return a


def brute():
    a=Asset('brute')
    a.pivot('head',(0,0,1.9))
    a.pivot('cape',(0,.22,1.87))
    leg(a,-.28,1.12,.24,'iron','leg_l')
    leg(a,.28,1.12,.24,'iron','leg_r')
    faceted_cloth(a,[(.73,.47,.30,0),(1.26,.36,.24,0)],'red','body',8)
    ico(a,(0,0,1.59),(.64,.40,.47),'iron','body',2)
    poly_extrude(a,[(-.48,1.81),(-.36,1.31),(0,1.21),(.36,1.31),(.48,1.81)],-.33,.13,'iron')
    for x in [-.28,.28]:
        cube(a,(x,-.402,1.56),(.07,.04,.42),'bronze',rotation=(0,x*.7,0))
    ico(a,(0,-.43,1.65),(.13,.04,.16),'ember')
    cube(a,(0,0,1.17),(.81,.64,.16),'leather',bevel=.03)
    cube(a,(0,-.34,1.17),(.25,.07,.22),'bronze',bevel=.03)
    for side,label in [(-1,'l'),(1,'r')]:
        p='arm_'+label
        a.pivot(p,(side*.57,0,1.82))
        ico(a,(side*.59,0,1.82),(.36,.36,.28),'iron',p)
        rod(a,(side*.59,.02,2.01),(side*.82,.03,2.28),.1,'bronze',p,r2=0)
        rod(a,(side*.59,0,1.7),(side*.77,-.05,1.23),.16,'cloth',p)
        cube(a,(side*.79,-.05,1.22),(.34,.34,.43),'iron',p,.06)
        cube(a,(side*.79,-.21,1.24),(.19,.07,.34),'bronze',p,.025)
        ico(a,(side*.80,-.05,.96),(.15,.17,.16),'leather',p)
    # Fully masked iron executioner helmet.
    ico(a,(0,0,2.1),(.31,.28,.33),'iron','head',2)
    poly_extrude(a,[(-.22,2.25),(-.20,1.93),(0,1.84),(.20,1.93),(.22,2.25)],-.255,.07,'steel','head')
    cube(a,(0,-.299,2.14),(.33,.02,.045),'ember','head')
    rod(a,(0,0,2.31),(0,.03,2.56),.1,'bronze','head',r2=0)
    cape(a,(1.86,.28),(.64,.46),.48,.54)
    a.pivot('weapon',(.8,-.06,.96),'arm_r')
    rod(a,(.8,-.06,.4),(.8,-.06,1.27),.065,'wood','weapon')
    cube(a,(.8,-.06,.42),(.56,.49,.41),'iron','weapon',.065)
    for side in [-1,1]:
        rod(a,(.8+side*.24,-.06,.42),(.8+side*.43,-.06,.42),.12,'bronze','weapon',r2=0)
    cube(a,(.8,-.318,.42),(.22,.025,.21),'ember','weapon',.025)
    return a


def boss():
    a=Asset('boss')
    a.pivot('head',(0,0,2.62))
    a.pivot('cape',(0,.34,2.5))
    leg(a,-.38,1.1,.32,'iron','leg_l')
    leg(a,.38,1.1,.32,'iron','leg_r')
    # Bell-shaped lower armor, intentionally segmented into chased bronze tiers.
    faceted_cloth(a,[(.40,1.02,.65,0),(.52,1.02,.65,0),(.69,.89,.59,0),(1.35,.60,.44,0),(1.57,.60,.43,0)],'bronze','body',12)
    faceted_cloth(a,[(.43,1.065,.68,0),(.55,1.065,.68,0)],'gold','body',12)
    for i in range(8):
        theta=math.tau*i/8
        x,y=math.cos(theta),math.sin(theta)
        rod(a,(x*.62,y*.45,1.38),(x*.98,y*.65,.56),.026,'dark')
    ico(a,(0,0,2.04),(.76,.43,.64),'iron','body',2)
    poly_extrude(a,[(-.59,2.42),(-.50,1.80),(0,1.58),(.50,1.80),(.59,2.42),(0,2.52)],-.36,.2,'bronze')
    poly_extrude(a,[(-.22,2.26),(0,1.85),(.22,2.26),(0,2.43)],-.482,.03,'dark')
    poly_extrude(a,[(-.095,2.24),(0,2.02),(.095,2.24),(0,2.34)],-.51,.035,'ember')
    for side,label in [(-1,'l'),(1,'r')]:
        p='arm_'+label
        a.pivot(p,(side*.77,0,2.35))
        ico(a,(side*.8,0,2.36),(.44,.45,.34),'bronze',p)
        for j in range(3):
            rod(a,(side*(.66+j*.12),.02,2.55),(side*(.7+j*.20),.03,2.96-j*.08),.092,'bone',p,r2=0)
        rod(a,(side*.86,0,2.26),(side*1.09,-.05,1.8),.18,'dark',p)
        cube(a,(side*1.08,-.02,1.68),(.40,.43,.55),'iron',p,.07,rotation=(0,-side*.1,0))
        cube(a,(side*1.08,-.26,1.7),(.29,.065,.37),'bronze',p,.04)
        ico(a,(side*1.13,-.04,1.35),(.21,.22,.23),'iron',p)
    skull(a,2.89,.34,'head','ember')
    # Crown with horns turning upward: readable silhouette at gameplay distance.
    torus(a,(0,0,3.1),.30,.06,'bronze','head')
    for side in [-1,1]:
        pts=[(side*.24,.02,3.03),(side*.51,.03,3.28),(side*.56,.04,3.56),(side*.43,.015,3.83)]
        for i in range(3):
            rod(a,pts[i],pts[i+1],.105-i*.026,'bone','head',r2=max(0,.075-i*.033))
    for x in [-.16,0,.16]:
        rod(a,(x,-.10,3.12),(x,-.10,3.39-abs(x)*.5),.045,'gold','head',r2=0)
    cape(a,(2.5,.28),(.48,.84),.6,.86,'red')
    a.pivot('weapon',(1.13,-.03,1.35),'arm_r')
    rod(a,(1.13,-.03,.45),(1.13,-.03,2.34),.078,'wood','weapon')
    for z in [.75,1.46,2.05]:
        cone(a,(1.13,-.03,z),.103,.103,.08,'bronze','weapon')
    # Massive chime hammer.
    cone(a,(1.13,-.03,2.26),.4,.23,.6,'bronze','weapon',10)
    torus(a,(1.13,-.03,1.98),.4,.065,'gold','weapon')
    ico(a,(1.13,-.03,1.94),(.16,.16,.19),'ember','weapon')
    return a


def pillar():
    a=Asset('pillar')
    cube(a,(0,0,.13),(1.0,1.0,.26),'edge',bevel=.06)
    cube(a,(0,0,.31),(.81,.81,.13),'stone',bevel=.035)
    cone(a,(0,0,1.32),.36,.31,1.91,'stone',verts=8)
    for x,y in [(-.23,-.23),(.23,-.23),(-.23,.23),(.23,.23)]:
        rod(a,(x,y,.43),(x*.86,y*.86,2.13),.077,'edge',verts=6)
    for z in [.47,1.77,2.2]:
        cone(a,(0,0,z),.41,.41,.12,'edge',verts=8)
    cube(a,(0,0,2.32),(.86,.86,.17),'edge',bevel=.04)
    cube(a,(0,0,2.48),(1.05,1.05,.16),'stone',bevel=.045)
    poly_extrude(a,[(-.13,1.8),(0,1.61),(.13,1.8),(0,2.05)],-.333,.06,'bronze')
    return a


def arch():
    a=Asset('arch')
    for side in [-1,1]:
        x=side*1.18
        cube(a,(x,0,.15),(.68,.8,.30),'edge',bevel=.045)
        cube(a,(x,0,1.27),(.44,.58,2.10),'stone',bevel=.035)
        for z in [.4,1.65,2.21]:
            cube(a,(x,0,z),(.56,.68,.13),'edge',bevel=.025)
        rod(a,(x-side*.19,-.27,.43),(x-side*.19,-.27,2.19),.075,'edge',verts=6)
        # Voussoir blocks follow an upward pointed Gothic profile.
        inner=[(side*1.0,2.17),(side*.91,2.52),(side*.67,2.91),(side*.34,3.26),(0,3.56)]
        outer=[(side*1.47,2.17),(side*1.39,2.68),(side*1.05,3.19),(side*.55,3.66),(0,4.02)]
        for i in range(4):
            outline=[inner[i],inner[i+1],outer[i+1],outer[i]]
            poly_extrude(a,outline,0,.64,'edge' if i%2 else 'stone')
        rod(a,(x,-.34,2.31),(side*.10,-.34,3.63),.045,'bronze')
    poly_extrude(a,[(-.20,3.55),(0,3.32),(.20,3.55),(0,3.89)],-.37,.12,'bronze')
    poly_extrude(a,[(-.065,3.57),(0,3.45),(.065,3.57),(0,3.72)],-.446,.018,'ember')
    return a


def brazier():
    a=Asset('brazier')
    cone(a,(0,0,.085),.31,.27,.17,'stone',verts=8)
    cone(a,(0,0,.22),.23,.16,.13,'bronze',verts=8)
    cone(a,(0,0,.58),.11,.11,.66,'iron',verts=8)
    for z in [.31,.74]:
        torus(a,(0,0,z),.12,.035,'bronze')
    cone(a,(0,0,.97),.16,.36,.23,'bronze',verts=10)
    torus(a,(0,0,1.085),.35,.035,'gold')
    cone(a,(0,0,1.09),.3,.3,.025,'dark',verts=10)
    a.pivot('flame',(0,0,1.12))
    ico(a,(0,0,1.28),(.21,.19,.29),'ember','flame')
    cone(a,(.025,.0,1.56),.16,0,.43,'ember','flame',6)
    ico(a,(-.04,-.075,1.24),(.10,.12,.19),'fire','flame')
    cone(a,(-.05,-.03,1.41),.08,0,.34,'fire','flame',5)
    for i in range(5):
        t=math.tau*i/5
        rod(a,(math.cos(t)*.30,math.sin(t)*.30,1.0),(math.cos(t)*.30,math.sin(t)*.30,1.28),.021,'iron')
    return a


def sarcophagus():
    a=Asset('sarcophagus')
    cube(a,(0,0,.12),(1.17,2.30,.24),'edge',bevel=.055)
    cube(a,(0,0,.43),(1.02,2.14,.50),'stone',bevel=.06)
    cube(a,(0,0,.76),(1.14,2.27,.20),'edge',bevel=.055)
    cube(a,(0,0,.90),(.98,2.11,.12),'stone',bevel=.04)
    # Carved recumbent knight on the lid, lying along the long axis.
    ico(a,(0,.65,1.05),(.19,.21,.12),'edge')
    cube(a,(0,.19,1.03),(.40,.56,.14),'edge',bevel=.055)
    for side in [-1,1]:
        rod(a,(side*.12,-.12,1.03),(side*.14,-.75,1.01),.078,'edge')
        rod(a,(side*.26,.35,1.02),(side*.17,-.20,1.04),.065,'edge')
    cube(a,(0,-.08,1.135),(.035,1.15,.025),'bronze')
    cube(a,(0,.27,1.14),(.30,.045,.03),'bronze')
    for side in [-1,1]:
        for y in [-.65,.15,.7]:
            cube(a,(side*.523,y,.44),(.04,.28,.25),'bronze',bevel=.035)
    return a


def altar():
    a=Asset('altar')
    for z,w,d in [(.10,1.8,1.35),(.26,1.52,1.10)]:
        cube(a,(0,0,z),(w,d,.19),'edge',bevel=.05)
    cube(a,(0,0,.59),(1.16,.78,.61),'stone',bevel=.04)
    cube(a,(0,0,.96),(1.72,1.20,.21),'edge',bevel=.05)
    for side in [-1,1]:
        rod(a,(side*.53,-.4,.35),(side*.53,-.4,.88),.065,'bronze')
    poly_extrude(a,[(-.14,.6),(0,.42),(.14,.6),(0,.8)],-.401,.04,'ember')
    cube(a,(0,0,1.085),(.57,.52,.045),'red',rotation=(0,0,.12))
    cube(a,(0,-.01,1.13),(.43,.37,.045),'bone',rotation=(0,0,.12))
    cube(a,(0,-.025,1.157),(.02,.34,.012),'bronze',rotation=(0,0,.12))
    for x,y,h in [(-.57,.27,.21),(-.37,.37,.32),(.54,.3,.28)]:
        cone(a,(x,y,1.07+h/2),.045,.04,h,'bone',verts=8)
        ico(a,(x,y,1.09+h),(.03,.03,.07),'fire')
    return a


def chest():
    a=Asset('chest')
    cube(a,(0,0,.13),(1.01,.66,.16),'iron',bevel=.035)
    cube(a,(0,0,.39),(.96,.61,.43),'wood',bevel=.035)
    for x in [-.38,.38]:
        cube(a,(x,-.327,.37),(.08,.04,.44),'bronze',bevel=.014)
        cube(a,(x,.327,.37),(.08,.04,.44),'bronze',bevel=.014)
    for y in [-.326,.326]:
        cube(a,(0,y,.55),(1.01,.044,.074),'bronze',bevel=.012)
    a.pivot('lid',(0,.30,.58))
    # Rounded lid assembled as a 6-sided barrel section.
    verts=[]
    for x in [-.50,.50]:
        for i in range(7):
            t=math.pi*i/6
            verts.append((x,math.cos(t)*.33,.58+math.sin(t)*.25))
    faces=[tuple(reversed(range(7))),tuple(range(7,14))]
    faces += [(i,i+1,i+8,i+7) for i in range(6)]
    faces += [(0,6,13,7)]
    mesh(a,verts,faces,'wood','lid')
    for x in [-.39,.39]:
        for i in range(6):
            t1=math.pi*i/6
            t2=math.pi*(i+1)/6
            rod(a,(x,math.cos(t1)*.338,.58+math.sin(t1)*.26),
                (x,math.cos(t2)*.338,.58+math.sin(t2)*.26),.042,'bronze','lid',verts=4)
    cube(a,(0,-.354,.56),(.17,.04,.23),'gold','lid',.02)
    cube(a,(0,-.38,.565),(.045,.018,.063),'dark','lid',.006)
    return a


def crystal():
    a=Asset('crystal')
    for pos,size in [((0,0,.12),(.55,.43,.2)),((.24,.12,.09),(.27,.31,.14)),((-.25,-.14,.08),(.3,.27,.13))]:
        ico(a,pos,size,'stone')
    for i,(x,y,h,r) in enumerate([(-.05,.04,1.12,.19),(.26,.06,.70,.13),(-.29,.10,.54,.12),(.11,-.25,.44,.115)]):
        cone(a,(x,y,.15+h*.38),r,r*.85,h*.75,'purple',verts=6)
        cone(a,(x,y,.15+h*.875),r*.85,0,h*.25,'purple',verts=6)
        rod(a,(x+r*.2,y-r*.78,.2),(x+r*.18,y-r*.69,.15+h*.73),.018,'teal',verts=4)
    return a


BUILDERS=[player,skeleton,wraith,brute,boss,pillar,arch,brazier,sarcophagus,altar,chest,crystal]
assets=[]
manifest={'formatVersion':1,'authoring':'Blender 5.2.1; original procedural geometry, flat PBR materials',
          'coordinates':{'units':'meters','origin':'ground centered','blenderUp':'+Z','blenderForward':'-Y',
                         'gltfUp':'+Y','gltfForward':'+Z'},
          'animation':'Rigid named pivots; no skeleton or baked clips. Rotate limb pivots around local X for walk swings.',
          'assets':{}}
for builder in BUILDERS:
    a=builder()
    a.finalize()
    bpy.context.view_layer.update()
    mesh_objects=[o for o in a.descendants() if o.type=='MESH']
    points=[o.matrix_world@vertex.co for o in mesh_objects for vertex in o.data.vertices]
    mn=[min(p[k] for p in points) for k in range(3)]
    mx=[max(p[k] for p in points) for k in range(3)]
    # Keep every exported asset exactly grounded while preserving body-centered X/Y.
    ground_offset = mn[2]
    for child in a.root.children:
        child.location.z -= ground_offset
    bpy.context.view_layer.update()
    mn[2] -= ground_offset
    mx[2] -= ground_offset
    bpy.ops.object.select_all(action='DESELECT')
    for o in a.descendants():
        o.select_set(True)
    fp=os.path.join(OUT,a.name+'.glb')
    bpy.ops.export_scene.gltf(filepath=fp,export_format='GLB',use_selection=True,
                             export_apply=False,export_animations=False,export_cameras=False,
                             export_lights=False,export_draco_mesh_compression_enable=False,
                             export_yup=True)
    manifest['assets'][a.name]={
        'file':a.name+'.glb','bytes':os.path.getsize(fp),
        'dimensions':[round(mx[0]-mn[0],4),round(mx[2]-mn[2],4),round(mx[1]-mn[1],4)],
        'boundsBlender':{'min':[round(n,4) for n in mn],'max':[round(n,4) for n in mx]},
        'nodes':[p.name for p in a.pivots.values()],
        'meshCount':len(mesh_objects),'triangles':sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in mesh_objects),
        'materials':sorted({m.name for o in mesh_objects for m in o.data.materials})}
    assets.append(a)
    print('ASSET_EXPORTED',a.name,manifest['assets'][a.name])
with open(os.path.join(OUT,'manifest.json'),'w') as f:
    json.dump(manifest,f,indent=2)

# Arrange an editable gallery after exporting. Asset-local origins remain in GLBs.
positions={
    'player':(-5,-1.9,0),'skeleton':(-3,-1.9,0),'wraith':(-1,-1.9,0),'brute':(1.3,-1.9,0),'boss':(4.2,-1.25,0),
    'pillar':(-5,2.8,0),'arch':(-2,3.2,0),'brazier':(.1,2.7,0),'sarcophagus':(2.3,3,0),
    'altar':(4.3,3.2,0),'chest':(-2,-4.2,0),'crystal':(.2,-4.2,0)}
for a in assets:
    a.root.location=positions[a.name]

gallery=Asset('Gallery')
cube(gallery,(0,0,-.14),(14.8,11.3,.25),'dark',bevel=.14)
for a in assets:
    x,y,z=positions[a.name]
    # Display plinths are in a separate gallery object and do not ship in game files.
    if a.name in ['player','skeleton','wraith','brute','boss']:
        cone(gallery,(x,y,-.025),.74 if a.name!='boss' else 1.13,.74 if a.name!='boss' else 1.13,.13,'stone',verts=12)
        torus(gallery,(x,y,.044),.71 if a.name!='boss' else 1.09,.011,'bronze')
gallery.finalize()

def text_object(body,pos,size,mat='bone'):
    bpy.ops.object.text_add(location=pos)
    o=bpy.context.object
    o.name='GalleryLabel_'+body
    o.data.body=body
    o.data.align_x='CENTER'
    o.data.size=size
    o.data.extrude=.001
    o.data.materials.append(M[mat])
    # Lie on ground, with text top toward back of gallery.
    o.rotation_euler=(0,0,0)
    return o

for a in assets:
    if a.name in ['player','skeleton','wraith','brute','boss']:
        x,y,z=positions[a.name]
        text_object(a.name.upper(),(x,y-.92,.012),.18)
text_object('E M B E R F A L L',(0,-5.0,.016),.53,'gold')
text_object('ORIGINAL GAME ASSET COLLECTION',(0,5.0,.016),.25,'bone')

scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=48
scene.cycles.use_denoising=True
scene.render.resolution_x=1920
scene.render.resolution_y=1380
scene.render.resolution_percentage=100
scene.world.color=(.08,.08,.08)
world=scene.world
world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.055,.072,.11,1)
world.node_tree.nodes['Background'].inputs[1].default_value=.4

def area(name,pos,color,power,size,target=(0,0,0)):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=pos
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

area('WarmKey',(-5,-6,10),(1,.78,.55),2300,7,(0,0,1))
area('MoonRim',(3,5,9),(.32,.65,1),3100,6,(0,0,1))
area('SoftFill',(8,-4,6),(.55,.71,1),1600,6,(0,0,1))
cd=bpy.data.cameras.new('AssetGalleryCamera')
co=bpy.data.objects.new('AssetGalleryCamera',cd)
bpy.context.collection.objects.link(co)
co.location=(11,-20,20)
target=Vector((0,.2,1.0))
co.rotation_euler=(target-co.location).to_track_quat('-Z','Y').to_euler()
cd.type='ORTHO';cd.ortho_scale=18.8
scene.camera=co
scene.view_settings.view_transform='AgX'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=os.path.join(HERE,'asset-gallery.png')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE,'emberfall-assets.blend'))
bpy.ops.render.render(write_still=True)
print('COMPLETE',len(assets),'assets',sum(x['bytes'] for x in manifest['assets'].values()),'bytes')

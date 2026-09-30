"""Read-only geometry/material/name checks for the shipped GLB collection."""
from pathlib import Path
import json, math, struct

BASE=Path(__file__).resolve().parent.parent/'public'/'assets'/'models'

def mm(a,b):
    return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]

def matrix(n):
    if 'matrix' in n:
        a=n['matrix'];return [[a[c*4+r] for c in range(4)] for r in range(4)]
    x,y,z,w=n.get('rotation',[0,0,0,1]);sx,sy,sz=n.get('scale',[1,1,1]);tx,ty,tz=n.get('translation',[0,0,0])
    return [[(1-2*y*y-2*z*z)*sx,(2*x*y-2*z*w)*sy,(2*x*z+2*y*w)*sz,tx],
            [(2*x*y+2*z*w)*sx,(1-2*x*x-2*z*z)*sy,(2*y*z-2*x*w)*sz,ty],
            [(2*x*z-2*y*w)*sx,(2*y*z+2*x*w)*sy,(1-2*x*x-2*y*y)*sz,tz],[0,0,0,1]]

report=[]
manifest=json.loads((BASE/'manifest.json').read_text())
for stem, entry in manifest['assets'].items():
    p=BASE/(stem+'.glb');data=p.read_bytes()
    magic,version,size=struct.unpack_from('<III',data)
    assert magic==0x46546c67 and version==2 and size==len(data),p
    length,typ=struct.unpack_from('<II',data,12);assert typ==0x4e4f534a
    g=json.loads(data[20:20+length]);binoff=20+length
    binlength,bintype=struct.unpack_from('<II',data,binoff);assert bintype==0x004e4942
    binary=data[binoff+8:binoff+8+binlength]
    assert not g.get('extensionsRequired'),p
    assert not g.get('textures') and not g.get('images'),p
    names=[n.get('name','') for n in g['nodes']]
    assert len(names)==len(set(names)),p
    for expected in entry['nodes']:
        assert expected in names,(p,expected)
    for m in g['materials']:
        mr=m['pbrMetallicRoughness']
        assert 0<=mr.get('metallicFactor',1)<=1
        assert 0<=mr.get('roughnessFactor',1)<=1
    triangles=0;positions=[]
    def visit(idx,parent):
        global triangles
        n=g['nodes'][idx];world=mm(parent,matrix(n))
        if 'mesh' in n:
            for prim in g['meshes'][n['mesh']]['primitives']:
                assert prim.get('mode',4)==4
                assert 'NORMAL' in prim['attributes']
                a=g['accessors'][prim['attributes']['POSITION']];v=g['bufferViews'][a['bufferView']]
                assert a['componentType']==5126 and a['type']=='VEC3'
                offset=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
                for i in range(a['count']):
                    p=struct.unpack_from('<fff',binary,offset+i*stride)
                    p=[sum(world[r][c]*p[c] for c in range(3))+world[r][3] for r in range(3)]
                    assert all(math.isfinite(v) for v in p)
                    positions.append(p)
                triangles+=g['accessors'][prim['indices']]['count']//3
        for c in n.get('children',[]):visit(c,world)
    identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]
    for idx in g['scenes'][g.get('scene',0)]['nodes']:visit(idx,identity)
    mn=[min(p[k] for p in positions) for k in range(3)];mx=[max(p[k] for p in positions) for k in range(3)]
    dimensions=[mx[k]-mn[k] for k in range(3)]
    assert abs(mn[1])<1e-5,(stem,'not grounded',mn)
    assert all(abs(dimensions[k]-entry['dimensions'][k])<.0002 for k in range(3)),(stem,dimensions,entry['dimensions'])
    assert triangles==entry['triangles'],(stem,triangles,entry['triangles'])
    assert len(data)<1_000_000
    if stem in ['player','skeleton','wraith','brute','boss']:
        weapon=next(n for n in g['nodes'] if n.get('name')==stem+'_weapon')
        assert math.dist(weapon.get('translation',[0,0,0]),[0,0,0])<1.5
        # Eye meshes are included in head; player and enemy front is +Z after Z-up conversion.
    report.append({'asset':stem,'bytes':len(data),'triangles':triangles,'drawCalls':sum(len(m['primitives']) for m in g['meshes']),
                   'dimensionsXYZ':[round(v,4) for v in dimensions],'groundY':round(mn[1],7),
                   'externalResources':False,'status':'pass'})
print(json.dumps({'status':'pass','totalBytes':sum(x['bytes'] for x in report),'assets':report},indent=2))

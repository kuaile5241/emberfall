"""Recompute the shipped V3 model manifest without altering model assets."""
from pathlib import Path
import json, struct, hashlib
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/assets/models-v3'
source=json.loads((OUT/'Mage-source.json').read_text())
models=[]
for name in ['Mage','Fire_Sword','Lightning_Spear','Water_Staff']:
    path=OUT/f'{name}.glb';data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+n]);a=g.get('accessors',[])
    triangles=sum(a[p['indices']]['count']//3 if 'indices' in p else a[p['attributes']['POSITION']]['count']//3 for m in g.get('meshes',[]) for p in m['primitives'] if p.get('mode',4)==4)
    item={'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'meshes':len(g.get('meshes',[])),'triangles':triangles,'skins':len(g.get('skins',[])),'joint_counts':[len(s['joints']) for s in g.get('skins',[])],'animation_names':[x['name'] for x in g.get('animations',[])],'materials':[m.get('name','unnamed') for m in g.get('materials',[])],'up':'+Y','forward':'+Z'}
    if name=='Mage':
        item.update({'author':'Kay Lousberg / KayKit Game Assets','license':'CC0 1.0','license_file':'LICENSE-Mage.txt','official_source':source['officialRepo']+'/blob/'+source['commit']+'/addons/kaykit_character_pack_adventures/Characters/gltf/Mage.glb','verified_git_blob_sha1':source['gitBlobSha1'],'default_hidden_meshes':['Spellbook','Spellbook_open','1H_Wand','2H_Staff'],'keep_mesh_prefix':'Mage_'})
        blob=hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest();assert blob==source['gitBlobSha1']
    else:item.update({'author':'Original Emberfall project geometry generated in Blender','provenance':'tools/element_weapons_v3.py','external_meshes_used':False,'editable_source':'blender/emberfall-v3-elemental-weapons.blend','grip_origin':[0,0,0],'long_axis':'+Y'})
    models.append(item)
report={'version':'0.3','checked_at':'2026-10-01 Asia/Shanghai','scope':'V3 new assets only; V2 sources and licenses are retained in public/assets/vendor/manifest-v2.json','new_models':models}
(OUT/'manifest-v3.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({m['file']:{k:m[k] for k in ['bytes','meshes','triangles','skins']} for m in models},indent=2))

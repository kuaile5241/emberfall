#!/usr/bin/env python3
"""Download verified CC0 author assets, and package official glTF accessories.

No mesh creation, decimation or rig changes. Requires Python stdlib and curl.
Every GitHub payload is checked against its official Git blob SHA1. The CDN is
only a transport for a fixed official commit; licenses are kept with the pack.
"""
from pathlib import Path
import base64
import concurrent.futures
import hashlib
import json
import struct
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/assets/vendor'
KAY = DEST / 'kaykit'
REPOS = {
    'adventurers': ('KayKit-Character-Pack-Adventures-1.0', '672074b73ba276876a19e8816ecdc5241817ab47', 'KayKit-Character-Pack-Adventures-1.0-tree.json'),
    'skeletons': ('KayKit-Character-Pack-Skeletons-1.0', '15b62b9bad122f72926c10fb14d622c73819fa54', 'KayKit-Character-Pack-Skeletons-1.0-tree.json'),
    'dungeon': ('KayKit-Dungeon-Remastered-1.0', 'b0ca9bd96a8072ab36a3a5464f00ed1e06a16d07', 'dungeon-tree.json'),
}


def curl(url):
    return subprocess.check_output(['curl', '-fLsS', '--max-time', '60', url])


def git_hash(content):
    return hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest()


def get_tree(kind):
    repo, commit, tree_file = REPOS[kind]
    target = KAY / tree_file
    if not target.exists():
        target.write_bytes(curl(f'https://api.github.com/repos/KayKit-Game-Assets/{repo}/git/trees/{commit}?recursive=1'))
    tree = json.loads(target.read_text())
    assert tree['sha'] == commit
    return {item['path']: item for item in tree['tree'] if item['type'] == 'blob'}


def download(kind, source_path, target):
    repo, commit, _ = REPOS[kind]
    entry = TREES[kind][source_path]
    url = f'https://cdn.jsdelivr.net/gh/KayKit-Game-Assets/{repo}@{commit}/{source_path}'
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or git_hash(target.read_bytes()) != entry['sha']:
        content = curl(url)
        assert git_hash(content) == entry['sha'], f'Blob mismatch: {source_path}'
        target.write_bytes(content)
    content = target.read_bytes()
    result = {'file': str(target.relative_to(DEST)), 'source': f'https://github.com/KayKit-Game-Assets/{repo}/blob/{commit}/{source_path}',
              'transport': url, 'bytes': len(content), 'git_blob_sha1': entry['sha'], 'sha256': hashlib.sha256(content).hexdigest()}
    print(result['file'], result['bytes'], 'verified', flush=True)
    return result


def pack_gltf(source, output):
    """Embed original .bin and PNG data; leave nodes, skins and meshes unchanged."""
    data = json.loads(source.read_text())
    chunks = bytearray()
    offsets = []
    for buf in data['buffers']:
        while len(chunks) % 4: chunks.append(0)
        offsets.append(len(chunks))
        chunks.extend((source.parent / buf['uri']).read_bytes())
    for view in data['bufferViews']:
        view['byteOffset'] = view.get('byteOffset', 0) + offsets[view['buffer']]
        view['buffer'] = 0
    for image in data.get('images', []):
        if 'uri' not in image: continue
        image_path = source.parent / image.pop('uri')
        raw = image_path.read_bytes()
        while len(chunks) % 4: chunks.append(0)
        data['bufferViews'].append({'buffer': 0, 'byteOffset': len(chunks), 'byteLength': len(raw)})
        image['bufferView'] = len(data['bufferViews']) - 1
        image['mimeType'] = 'image/png' if image_path.suffix == '.png' else 'image/jpeg'
        chunks.extend(raw)
    data['buffers'] = [{'byteLength': len(chunks)}]
    while len(chunks) % 4: chunks.append(0)
    header = json.dumps(data, separators=(',', ':')).encode()
    while len(header) % 4: header += b' '
    blob = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(header) + 8 + len(chunks))
            + struct.pack('<II', len(header), 0x4E4F534A) + header
            + struct.pack('<II', len(chunks), 0x004E4942) + chunks)
    output.write_bytes(blob)


def inspect_glb(path):
    blob = path.read_bytes()
    magic, version, total = struct.unpack_from('<III', blob)
    assert magic == 0x46546C67 and version == 2 and total == len(blob)
    length = struct.unpack_from('<I', blob, 12)[0]
    data = json.loads(blob[20:20 + length])
    clips = []
    for animation in data.get('animations', []):
        duration = max((data['accessors'][sampler['input']].get('max', [0])[0] for sampler in animation['samplers']), default=0)
        clips.append({'name': animation['name'], 'duration': round(duration, 5), 'channels': len(animation['channels'])})
    primitives = [primitive for mesh in data.get('meshes', []) for primitive in mesh['primitives']]
    return {'file': str(path.relative_to(DEST)), 'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest(),
            'meshes': len(data.get('meshes', [])), 'skins': len(data.get('skins', [])),
            'triangles': sum(data['accessors'][primitive['indices']]['count'] // 3 for primitive in primitives if 'indices' in primitive),
            'mesh_nodes': [node.get('name') for node in data.get('nodes', []) if 'mesh' in node],
            'materials': data.get('materials', []), 'images': data.get('images', []),
            'external_images': [image['uri'] for image in data.get('images', []) if 'uri' in image],
            'bones': [[data['nodes'][n].get('name') for n in skin['joints']] for skin in data.get('skins', [])],
            'animations': clips}


if __name__ == '__main__':
    KAY.mkdir(parents=True, exist_ok=True)
    TREES = {kind: get_tree(kind) for kind in REPOS}
    tasks = []
    for kind, character in [('adventurers', 'Knight'), ('adventurers', 'Rogue_Hooded'), ('skeletons', 'Skeleton_Warrior'), ('skeletons', 'Skeleton_Mage')]:
        folder = 'adventures' if kind == 'adventurers' else kind
        tasks.append((kind, f'addons/kaykit_character_pack_{folder}/Characters/gltf/{character}.glb', KAY / f'{character}.glb'))
    for kind in REPOS:
        tasks.append((kind, 'LICENSE.txt', KAY / ('props/LICENSE.txt' if kind == 'dungeon' else f'LICENSE-{kind}.txt')))
    for name in ['barrel_large_decorated', 'crates_stacked', 'pillar_decorated', 'wall_arched', 'torch_mounted', 'candle_triple', 'chest']:
        source_name = name + ('.glb' if name == 'chest' else '.gltf.glb')
        tasks.append(('dungeon', f'addons/kaykit_dungeon_remastered/Assets/gltf/{source_name}', KAY / f'props/{name}.glb'))
    accessories = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Staff', 'Skeleton_Shield_Large_A']
    source_dir = KAY / 'source-accessories'
    for name in accessories:
        for ext in ['gltf', 'bin']:
            tasks.append(('skeletons', f'addons/kaykit_character_pack_skeletons/Assets/gltf/{name}.{ext}', source_dir / f'{name}.{ext}'))
    tasks.append(('skeletons', 'addons/kaykit_character_pack_skeletons/Assets/gltf/skeleton_texture.png', source_dir / 'skeleton_texture.png'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(lambda task: download(*task), tasks))
    for name in accessories: pack_gltf(source_dir / f'{name}.gltf', KAY / f'{name}.glb')
    textures = []
    for asset in ['monastery_stone_floor', 'stone_wall', 'rocks_ground_05']:
        folder = DEST / 'polyhaven' / asset
        folder.mkdir(parents=True, exist_ok=True)
        metadata_path = folder / 'source-files.json'
        if not metadata_path.exists(): metadata_path.write_bytes(curl(f'https://api.polyhaven.com/files/{asset}'))
        metadata = json.loads(metadata_path.read_text())
        for map_name in ['Diffuse', 'nor_gl', 'Rough', 'AO']:
            entry = metadata[map_name]['1k']['jpg']
            target = folder / Path(entry['url']).name
            if not target.exists(): target.write_bytes(curl(entry['url']))
            raw = target.read_bytes()
            assert hashlib.md5(raw).hexdigest() == entry['md5']
            textures.append({'file': str(target.relative_to(DEST)), 'asset': asset, 'map': map_name, 'pixel_size': [1024, 1024],
                             'source': f'https://polyhaven.com/a/{asset}', 'download': entry['url'],
                             'bytes': len(raw), 'md5': entry['md5'], 'sha256': hashlib.sha256(raw).hexdigest()})
    assert sum(item['bytes'] for item in textures) < 30_000_000
    manifest = {'checked_at': '2026-09-30 Asia/Shanghai', 'license': 'CC0 1.0',
                'author_sources': sources, 'models': [inspect_glb(path) for path in sorted(KAY.rglob('*.glb'))],
                'textures': textures, 'texture_total_bytes': sum(item['bytes'] for item in textures)}
    inspection_path = KAY / 'blender-inspection.json'
    if inspection_path.exists():
        observations = {entry['asset']: entry for entry in json.loads(inspection_path.read_text())}
        for model in manifest['models']:
            observation = observations.get(Path(model['file']).stem)
            if observation:
                model.update({'up_axis': '+Y', 'forward_axis': '+Z', 'idle_height': observation['height'],
                              'idle_height_method': 'Blender 5.2.1, Idle frame 8 at 24fps, evaluated visible mesh vertices',
                              'default_hidden_mesh_nodes': observation['hidden_meshes'],
                              'preview': 'kaykit/' + observation['asset'] + '-inspection.png'})
    (DEST / 'manifest-v2.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    print('Manifest:', DEST / 'manifest-v2.json')

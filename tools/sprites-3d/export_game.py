"""render.py --export=<out.glb> --slug=<slug> [--more=<other.glb> ...] [--tris=5000] [--tex=1024] [--pad=16]: the game's live 3D model.

Called by render.py once the model is set up exactly as for a render (normalised to 1.98 units tall, feet on the
origin, under the `turn` empty; props and grafted parts on their bones), before any camera, light or shader change.
Writes one GLB per character with only the clips its moves use (ROLES in roles.py), each as an animation named for its
move (walk, run, attack0.., death), the mesh thinned to about --tris triangles and textures padded (--pad px round each atlas island) and cut to --tex px; and beside
it <out>.json with each clip's length and each attack's timing in seconds (roles.window over the weapon hand's path,
sampled at 24 fps), the body's --yaw turn and the bow's --release. The client (art/live3d.ts) plays these. The squash
(wider and shorter, as hand-drawn sprites are) is left to the client.
"""
import json, math, os, re
import bpy
from mathutils import Vector
from roles import ROLES, beats, window

FPS = 24


def _slug(s):
    return re.sub(r'[^a-z0-9]+', '_', (s.split('|')[1] if s.count('|') >= 2 else s).lower()).strip('_')


def _bind(ad, act):
    ad.action = act
    if getattr(act, 'slots', None) and len(act.slots): ad.action_slot = act.slots[0]


def pad_islands(img, n):
    """Meshy's atlas is hundreds of small islands on black with no margin: shrunk and sampled, the black bleeds in at
    every island edge (the cracks the Model Viewer showed, 2026-11-17). Spread each island's edge colours n px outward
    over the black first, each new pixel the mean of its filled neighbours."""
    import numpy as np
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    on = px[:, :, :3].max(axis=2) > 0.02
    for _ in range(n):
        if on.all(): break
        acc = np.zeros((h, w, 3), np.float32); cnt = np.zeros((h, w), np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            m = np.roll(np.roll(on, dy, 0), dx, 1)
            acc += np.roll(np.roll(px[:, :, :3], dy, 0), dx, 1) * m[:, :, None]; cnt += m
        grow = ~on & (cnt > 0)
        px[grow, :3] = acc[grow] / cnt[grow][:, None]
        on |= grow
    img.pixels.foreach_set(px.ravel())
    img.update()


def run(g):
    args, arm, scene, meshes = g['args'], g['arm'], g['scene'], g['meshes']
    out = next(a[9:] for a in args if a.startswith('--export='))
    slug = next(a[7:] for a in args if a.startswith('--slug='))
    tris_goal = int(next((a[7:] for a in args if a.startswith('--tris=')), 5000))
    tex = int(next((a[6:] for a in args if a.startswith('--tex=')), 1024))
    pad = int(next((a[6:] for a in args if a.startswith('--pad=')), 16))
    role = ROLES[slug]

    # clips from the other downloads (Meshy's walk and run come as their own files): keep the actions, drop the rest
    clips = list(g['CLIPS'])
    for more in [a[7:] for a in args if a.startswith('--more=')]:
        objs, acts = set(bpy.data.objects), set(bpy.data.actions)
        bpy.ops.import_scene.gltf(filepath=more)
        for o in [o for o in bpy.data.objects if o not in objs]: bpy.data.objects.remove(o, do_unlink=True)
        clips += [a for a in bpy.data.actions if a not in acts]

    def find(key):
        hit = [a for a in clips if key in _slug(a.name)]
        if not hit: raise SystemExit(f'{slug}: no clip matching {key!r} in {[a.name for a in clips]}')
        return hit[0]
    moves = {'walk': find(role['walk']), 'run': find(role['run'])}
    for k, key in enumerate(role['attack']): moves[f'attack{k}'] = find(key)
    moves['death'] = find(role['death'])
    for name, key in {**role.get('casts', {}), **role.get('loops', {})}.items(): moves[name] = find(key)   # the wizard's spell moves

    # each attack's timing, from the weapon hand's path at 24 fps (as render.py's track.json, as pack.py reads it)
    ad = arm.animation_data or arm.animation_data_create()
    for t in ad.nla_tracks: t.mute = True
    hand_bone = next((a[8:] for a in args if a.startswith('--track=')), 'RightHand')
    meta = {'slug': slug, 'fps': FPS, 'clips': {}, 'attacks': [], 'casts': {}, 'yaw': {}, 'release': {}, 'soft': []}
    # standing height (world units, as rendered: --height included), for fitting the rig's anchor points to the body
    for t in ad.nla_tracks: t.mute = True
    ad.action = None
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    bpy.context.view_layer.update()
    zs = [(m.matrix_world @ Vector(c)).z for m in meshes for c in m.bound_box]
    meta['height'] = round(max(zs) - min(zs), 4)
    for name, act in moves.items():
        f0, f1 = act.frame_range
        meta['clips'][name] = {'source': act.name, 'duration': round((f1 - f0) / scene.render.fps, 4)}
    yaw_args = [a[6:].split(':') for a in args if a.startswith('--yaw=')]
    rel_args = [a[10:].rsplit(':', 1) for a in args if a.startswith('--release=')]
    for k, key in enumerate(role['attack']):
        act = moves[f'attack{k}']
        f0, f1 = act.frame_range
        n = max(2, round((f1 - f0) / scene.render.fps * FPS))
        _bind(ad, act)
        hand = []
        for i in range(n):
            f = f0 + (f1 - f0) * i / n
            scene.frame_set(int(f), subframe=f - int(f))
            bpy.context.view_layer.update()
            hand.append(list(arm.matrix_world @ arm.pose.bones[hand_bone].head))
        first, hit, last, cut, _ = window(hand, FPS, role.get('tune', {}).get(key, {}))
        meta['attacks'].append({'clip': f'attack{k}', 'first': first / FPS, 'hit': hit / FPS, 'last': last / FPS,
                                'cut': [cut[0] / FPS, cut[1] / FPS] if cut[0] <= cut[1] else None})
        for y in yaw_args:   # --yaw frames are 12 fps
            if y[0] in key: meta['yaw'][f'attack{k}'] = [float(y[1])] + [int(v) / 12 for v in y[2:6]]
        for r in rel_args:
            if r[0] in key: meta['release'][f'attack{k}'] = int(r[1]) / 12
    # the wizard's spell moves: each one-shot's release (found like an attack's hit), in clip seconds
    for name in role.get('casts', {}):
        act = moves[name]
        f0, f1 = act.frame_range
        n = max(2, round((f1 - f0) / scene.render.fps * FPS))
        _bind(ad, act)
        hand = []
        for i in range(n):
            f = f0 + (f1 - f0) * i / n
            scene.frame_set(int(f), subframe=f - int(f))
            bpy.context.view_layer.update()
            hand.append(list(arm.matrix_world @ arm.pose.bones[hand_bone].head))
        b = beats(hand)
        meta['casts'][name] = {'first': int(b[0]) / FPS, 'hit': min(int(b[2]), round(b[1] + 0.5)) / FPS, 'last': int(b[2]) / FPS}

    # each cycle's stride: how far the ground passes under the feet in one loop (model units), so the client plays walk
    # and run by distance walked and the feet stay planted. An in-place clip moves its planted foot back (+Y, the model
    # faces -Y); a clip that travels moves its hips forward instead.
    for name in ('walk', 'run'):
        act = moves[name]
        f0, f1 = act.frame_range
        n = max(4, round((f1 - f0) / scene.render.fps * FPS))
        _bind(ad, act)
        feet, hips = [], []
        for i in range(n + 1):
            f = f0 + (f1 - f0) * i / n
            scene.frame_set(int(f), subframe=f - int(f))
            bpy.context.view_layer.update()
            feet.append([arm.matrix_world @ arm.pose.bones[b].head for b in ('LeftFoot', 'RightFoot')])
            hips.append(arm.matrix_world @ arm.pose.bones['Hips'].head)
        travel = abs(hips[-1].y - hips[0].y)
        slide = 0.0
        for i in range(n):
            lo = min((0, 1), key=lambda k: feet[i][k].z)   # the planted foot: the lower one
            slide += max(0.0, feet[i + 1][lo].y - feet[i][lo].y)
        meta['clips'][name]['stride'] = round(travel if travel > 0.25 * slide else slide, 4)
    ad.action = None

    # the clips as NLA tracks named for their moves: the exporter writes one animation per track
    for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
    for name, act in moves.items():
        tr = ad.nla_tracks.new(); tr.name = name
        st = tr.strips.new(name, int(act.frame_range[0]), act)
        if getattr(act, 'slots', None) and len(act.slots):
            try: st.action_slot = act.slots[0]
            except Exception: pass

    # soft props (the wizard's staff, render.py SOFT): the client turns the carrier back toward upright each frame as
    # soft_props does; a marker child at the prop's main axis gives that axis in whatever frame the export settles on
    # (render.py --firm: the moves whose clips hold it firmly, taking every turn of the hand, the client easing between)
    firm = [c for a in args if a.startswith('--firm=') for c in a[7:].split(',')]
    for e, _basis, k, ax in g.get('SOFT', []):
        mk = bpy.data.objects.new(e.name + ' axis', None); scene.collection.objects.link(mk)
        mk.parent = e; mk.location = ax
        meta['soft'].append({'node': e.name, 'axis': mk.name, 'k': k,
                             'firm': [mv for mv, act in moves.items() if any(c in _slug(act.name) for c in firm)]})
    # every held prop's carrier: one held in a hand drops when its holder dies (the client lays it on the ground beside
    # the body); one strapped on (the shieldbearer's shield, on the forearm) stays with the body
    meta['props'] = [{'node': e.name, 'name': name, 'bone': bone, 'drop': bone.endswith('Hand')} for e, name, bone in g.get('CARRIERS', [])]
    # --show=<name>[,<name>]: the props shown when the game names none (the wizard: the staff; its conjured arms wait hidden)
    show = [c for a in args if a.startswith('--show=') for c in a[7:].split(',')]
    if show: meta['show'] = show

    # the bow's live string and arrow are the client's (it draws them between the tips and the hand); drop the stand-ins
    for name in ('bow string', 'bow arrow', 'bow arrowhead'):
        o = bpy.data.objects.get(name)
        if o: bpy.data.objects.remove(o, do_unlink=True)
    # the conjured whip's lash is the client's too (drawn and swung by code, wizprops.py whip): only its handle ships
    for o in [o for o in bpy.data.objects if o.name.startswith('whip lash')]:
        bpy.data.objects.remove(o, do_unlink=True)

    # thinned for 32 px: the shape survives at a fraction of Meshy's triangles, and skinning keeps its vertex groups
    total = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
    ratio = min(1.0, tris_goal / max(1, total))
    for m in meshes:
        if ratio >= 1: break
        md = m.modifiers.new('thin', 'DECIMATE'); md.ratio = ratio
        with bpy.context.temp_override(object=m, active_object=m, selected_objects=[m]):
            bpy.ops.object.modifier_move_to_index(modifier='thin', index=0)
            bpy.ops.object.modifier_apply(modifier='thin')
    after = sum(sum(len(p.vertices) - 2 for p in m.data.polygons) for m in meshes)
    for img in bpy.data.images:
        if pad and img.type == 'IMAGE' and img.size[0] > 0: pad_islands(img, pad)
        if img.size[0] > tex or img.size[1] > tex: img.scale(tex, tex)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_animation_mode='NLA_TRACKS', export_image_format='JPEG', export_jpeg_quality=90,
                              export_yup=True, export_apply=False, export_force_sampling=True, export_cameras=False, export_lights=False)
    hips = arm.pose.bones.get('Hips')
    meta['tris'] = after
    meta['bones'] = [b.name for b in arm.data.bones]
    json.dump(meta, open(os.path.splitext(out)[0] + '.json', 'w'), indent=1)
    print('exported', out, f'{total} -> {after} triangles', {k: v['duration'] for k, v in meta['clips'].items()}, os.path.getsize(out) // 1024, 'KB')

"""Each character's clips and attack timing, shared by pack.py (baked sheets) and render.py --export (live 3D models).
Plain Python, so Blender's Python can import it too.

ROLES: per character, which clip plays each move (a substring of the clip's name). `tune` overrides an attack's timing
per clip, in 12 fps frames (scaled to any rate): `hit` where the hand's fastest step isn't the hit (a bow's is the reach
for the arrow), `cut` a still hold to leave out (never retimed), `first` / `end`. `grade` tints a texture off the
band's palette (baked sheets only).
"""
import math

ROLES = {
    'raider-hooded': {'walk': 'walking', 'run': 'sprint', 'attack': ['left_slash', 'thrust_slash', 'right_hand_sword_slash'], 'death': 'knock_down'},
    'raider-goggles': {'walk': 'walking', 'run': 'sprint', 'attack': ['left_slash', 'thrust_slash', 'right_hand_sword_slash'], 'death': 'knock_down'},
    # the archer's shot: the arrow leaves at clip frame 39 (render.py --release); the full draw held before it (34..38)
    # is left out, so the game's 1 s wind-up shows the draw rising into the shot
    'archer': {'walk': 'walking', 'run': 'running', 'attack': ['archery_shot'], 'death': 'knock_down',
               'tune': {'archery_shot': {'hit': 39, 'cut': (34, 38)}}},
    # the shieldbearer's thrust: Meshy's Thrust Slash thrusts (frames 0..8), then turns away and lunges into an overhead
    # slash; only the thrust is kept (the user, 2026-11-17: "seems like two combined things"), easing back to the legs after
    'shieldbearer': {'walk': 'walking', 'run': 'running', 'attack': ['thrust_slash', 'shield_push'], 'death': 'knock_down',
                     'tune': {'thrust_slash': {'hit': 8, 'end': 10}}},
    'hooker': {'walk': 'walking', 'run': 'running', 'attack': ['crouch_pull_and_throw'], 'death': 'knock_down', 'grade': (0.84, 0.93, 0.9)},
    'chieftain': {'walk': 'walking', 'run': 'running', 'attack': ['heavy_hammer_swing'], 'death': 'knock_down'},
    # the wizard: the staff's shove and weapon Strike as its attack; spell moves as one-shots with a release frame
    # (`casts`, found like an attack's hit), gathering as a loop (`loops`, the whole clip)
    'wizard': {'walk': 'walking_man', 'run': 'running', 'attack': ['right_hand_sword_slash'], 'death': 'knock_down',
               'casts': {'cast': 'mage_soell_cast_3', 'area': 'charged_ground_slam', 'self': 'mage_soell_cast',
                         # weapon blows (round 4): a two-handed thrust for the spear and trident, the lash for the whip, a draw and release for the bow
                         'thrust': 'attack_thrust', 'lash': 'attack_whip', 'shoot': 'archery_shot'},
               # the bow's draw is long and still: its release (the archer's, 3.25 s) and the draw before it, set by hand
               'cast_times': {'shoot': {'first': 2.0, 'hit': 3.25, 'last': 4.75}},
               # the guard clips (round 3): Meshy text-to-motion, a buckler held across the chest (output/wizard/guard-block.glb) and a
               # crouch braced behind a tower shield (guard-brace.glb); the library's boxing guards held it under the hat brim
               'loops': {'gather': 'mage_soell_cast_8', 'block': 'guard_block', 'brace': 'guard_brace'}},
}
LEAD = 1.2   # seconds of clip kept before an attack's hit: the longest game wind-up (the brute's 1.1)


def beats(hand):
    """(start, strike, end) frame positions of an attack clip from the weapon hand's path (one point a frame): the
    strike is its fastest step."""
    pts = list(hand)
    n = len(pts)
    if n < 4 or any(p is None for p in pts): return 0, n * 0.5, n - 1
    sp = [math.dist(pts[k], pts[k + 1]) for k in range(n - 1)]
    lo, hi = int(n * 0.1), max(int(n * 0.1) + 1, int(n * 0.9))
    s = max(range(lo, hi), key=lambda k: sp[k])
    peak = sp[s] or 1
    start = 0
    for k in range(s, -1, -1):   # back to where the wind-up begins: the hand first moves with intent
        if sp[k] < 0.08 * peak: start = k; break
    # back from the clip's end to the last step that still moves: the recovery is over there. (Searching forward for the
    # first still step stopped at holds, like an archer's pause after the shot, and cut the return to rest; the sprite
    # then snapped back.)
    end = n - 1
    for k in range(n - 2, s, -1):
        if sp[k] >= 0.05 * peak: end = k + 1; break
    end = min(n - 1, max(end, s + 4) + 1)
    return start, s + 0.5, end


def window(hand, fps, tune):
    """An attack clip's (first, hit, last, cut) frames at `fps`: trimmed to the wind-up's start and the end of the
    recovery, keeping at least LEAD seconds before the hit (the client starts a clip one game wind-up before its hit,
    and a trimmed start would hold its first frame through the rest); `hit` is the contact frame, just after the
    hand's fastest step; `cut` an inclusive range to leave out, or (1, 0) for none."""
    b = beats(hand)
    at = lambda v: round(v * fps / 12)
    first, last = at(tune['first']) if 'first' in tune else int(b[0]), at(tune['end']) if 'end' in tune else int(b[2])
    hit = min(last, at(tune['hit']) if 'hit' in tune else round(b[1] + 0.5))
    if 'first' not in tune: first = max(0, min(first, hit - round(LEAD * fps)))
    cut = tuple(at(v) for v in tune['cut']) if 'cut' in tune else (1, 0)
    return first, hit, last, cut, b

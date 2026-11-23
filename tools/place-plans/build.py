"""One command for a plan-made place (step 3 of tools/pipeline-3d): plan -> walk report -> level -> resolved scene -> content.

  python tools/place-plans/build.py court-d [--no-content]

1. The walk report (to_ldtk --report); any problem stops the build: a gate or landmark cut off, a jump inside a flight,
   an unguarded drop by a route, walkable ground no route reaches, ground within sight of the world's edge, a blocking
   prop on a route.
2. The level (to_ldtk), then the resolved scene beside it (vector.py), stamped with the level file's hash, so
   content:check can tell a scene that no longer matches its level.
3. Unless --no-content, npm run content:build and content:check in game/ (the agreement check runs there).
"""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import to_ldtk

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args or args[0] not in to_ldtk.LEVELS:
        raise SystemExit(f'usage: python tools/place-plans/build.py <{"|".join(to_ldtk.LEVELS)}> [--no-content]')
    name = args[0]
    r = to_ldtk.report(name)
    problems = {k: v for k, v in dict(cut_off=len(r['cut_off']), jumps=r['jumps'], drops=r['drops'], unvisited=r['unvisited'], edge=r['edge'], props=r.get('props', 0)).items() if v}
    if problems: raise SystemExit(f'{name}: the walk report found problems, so nothing was written: {problems}')
    to_ldtk.write_level(name)
    subprocess.run([sys.executable, os.path.join(HERE, 'vector.py'), name], check=True)
    if '--no-content' in sys.argv: return
    game = os.path.join(HERE, '..', '..', 'game')
    for cmd in ('content:build', 'content:check'):
        subprocess.run(f'npm run {cmd}', cwd=game, shell=True, check=True)

if __name__ == '__main__':
    main()

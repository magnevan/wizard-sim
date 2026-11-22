"""Shifts a ground texture's colour toward the buildings' palette, after ground-tiles.py. No generation calls.

  python tools/building-art/ground-tone.py <material> <saturation> <r> <g> <b>

Saturation scales the colour's distance from its own grey (0.7 is 30 % less saturated); r, g, b multiply the channels
(1.06 1.0 0.88 pulls toward gold). Writes the texture in place (game/content/assets/ground/<material>.png).
"""
import os, sys
import numpy as np
from PIL import Image

def main():
    name, sat, r, g, b = sys.argv[1], *map(float, sys.argv[2:6])
    p = os.path.join(os.path.dirname(__file__), '../../game/content/assets/ground', name + '.png')
    a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float32)
    grey = a.mean(axis=2, keepdims=True)
    a = grey + (a - grey) * sat
    a *= np.array([r, g, b], dtype=np.float32)
    Image.fromarray(a.clip(0, 255).round().astype(np.uint8)).save(p, optimize=True)
    print(name, 'saturation', sat, 'tint', (r, g, b))

if __name__ == '__main__':
    main()

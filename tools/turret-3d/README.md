# The turret head, from 3D

The flame turret's head is a low-poly model rendered to pixel art at 25 facings across its 160-degree swing. No generation calls. The tower stays bought art; only the head turns.

```
blender --background --python tools/turret-3d/flame_head.py -- <renders_dir>
python tools/turret-3d/pixelize.py <renders_dir> game/content/assets/turrets/flame
```

`flame_head.py` builds the model and renders it with the game's camera (orthographic, 30 degrees up, north up and to the right). Tune the look with its three materials, the sun and the line thickness. A full run takes about 15 seconds.

`pixelize.py` snaps every render pixel to the bought head's colours, takes the commonest colour per art pixel, adds the outline and pastes on the painted pilot flame. It writes `sheet.png` and `sheet.json` (facings, where the swivel sits on the tower, and the nozzle tip at each facing). The client reads them in `game/packages/client/src/art/props.ts`.

A turret for another element is mostly new materials and a different flame.

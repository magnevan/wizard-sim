// usage: node tools/weapon-variants/prompts.mjs
// Writes the Codex prompt files for the elemental weapon variant sheets into
// tools/concept-gen/prompts/2026-11-21-elemental-weapons/, and sheets.json (which cell is which variant).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '../concept-gen/prompts/2026-11-21-elemental-weapons');
fs.mkdirSync(outDir, { recursive: true });

// The base weapon as drawn on the approved sheet (docs/reference/wizard-arms/weapons-a.jpg).
const BASE = {
  'Flame sword': 'the Flame sword (Fire): a short broad blade sculpted as one stylised orange-to-yellow flame, dark iron crossguard, leather grip',
  'Stone maul': 'the Stone maul (Earth): a big rough brown-grey boulder head with a few violet crystal chips, bound to a gnarled wooden haft by twisted roots',
  'Arcane wand': 'the Arcane wand (Arcane): a short dark wand whose tip holds a big glowing orb in a three-pronged iron cradle; here the orb is hot magenta-pink',
  'Ice bow': 'the Ice bow (Ice): a bow carved from pale white-blue faceted ice with frosted edges and a leather-wrapped grip, pale glowing string',
  'Frost spear': 'the Frost spear (Cold): a pale frosted shaft ending in a jagged cyan icicle head',
  'Lightning whip': 'the Lightning whip (Lightning): a dark wood handle with a crystal pommel and a solid segmented zig-zag lash of pale lavender-white lightning in one loose S-curve',
  'Tide trident': 'the Tide trident (Water): a long deep-blue water shaft, a crossbar shaped as a curling wave, three glassy blue prongs with white foam tips',
  'Healing hands': "a pair of the wizard's own big chunky cartoon hands (as on his model sheet: same skin, same sleeve cuffs), held palms forward, glowing soft spring green with Life, a gentle green halo round the palms and a small leaf-shaped glow in each palm",
};

// One solid, sculpted motif per extra element, the same on every weapon, so an element reads the same everywhere.
const MOTIF = {
  fire: 'Fire (orange): a molten core: glowing orange-yellow cracks and a hot ember-bright edge running through it, like lava under a crust',
  water: 'Water (deep blue): a ribbon of smooth deep-blue water spiralling round it, with a few round glassy droplet beads',
  cold: 'Cold (pale cyan): a crust of white-cyan frost rime and little snow caps along its edges and tips',
  ice: 'Ice (white-blue, clear): clusters of clear white-blue faceted ice crystals growing out of it like spikes',
  lightning: 'Lightning (pale lavender-white): bright lavender-white zig-zag bolt inlays like glowing fracture lines, and a small copper coil',
  arcane: 'Arcane (hot magenta-pink): glowing magenta-pink rune inlays and one floating magenta crystal shard',
  earth: 'Earth (brown stone): chunky plates of rough brown stone bolted on like armour',
};
const NAME = { fire: 'Fire', water: 'Water', cold: 'Cold', ice: 'Ice', lightning: 'Lightning', arcane: 'Arcane', earth: 'Earth' };

// Sheets: each cell [weapon, extras]. Healing hands' pure version is drawn too (it has no prop on sheet A).
const SHEETS = [
  ['hands-1', [['Healing hands', []], ['Healing hands', ['cold']], ['Healing hands', ['earth']], ['Healing hands', ['fire']], ['Healing hands', ['ice']], ['Healing hands', ['lightning']]]],
  ['hands-2', [['Healing hands', ['water']], ['Healing hands', ['cold', 'earth']], ['Healing hands', ['cold', 'ice']], ['Healing hands', ['cold', 'lightning']], ['Healing hands', ['earth', 'fire']], ['Healing hands', ['earth', 'ice']]]],
  ['hands-3', [['Healing hands', ['earth', 'water']], ['Healing hands', ['fire', 'lightning']], ['Healing hands', ['fire', 'water']], ['Healing hands', ['ice', 'lightning']], ['Healing hands', ['ice', 'water']], ['Healing hands', ['earth', 'fire', 'water']]]],
  ['wand-1', [['Arcane wand', ['cold']], ['Arcane wand', ['fire']], ['Arcane wand', ['ice']], ['Arcane wand', ['lightning']], ['Arcane wand', ['water']], ['Arcane wand', ['cold', 'ice']]]],
  ['wand-2', [['Arcane wand', ['cold', 'lightning']], ['Arcane wand', ['fire', 'lightning']], ['Arcane wand', ['fire', 'water']], ['Arcane wand', ['ice', 'lightning']], ['Arcane wand', ['ice', 'water']], ['Arcane wand', []]]],
  ['maul-1', [['Stone maul', ['arcane']], ['Stone maul', ['cold']], ['Stone maul', ['fire']], ['Stone maul', ['ice']], ['Stone maul', ['water']], ['Stone maul', ['arcane', 'cold']]]],
  ['maul-2', [['Stone maul', ['arcane', 'fire']], ['Stone maul', ['arcane', 'ice']], ['Stone maul', ['arcane', 'water']], ['Stone maul', ['cold', 'ice']], ['Stone maul', ['fire', 'water']], ['Stone maul', ['ice', 'water']]]],
  ['bow-maul', [['Ice bow', ['cold']], ['Ice bow', ['lightning']], ['Ice bow', ['water']], ['Ice bow', ['cold', 'lightning']], ['Stone maul', ['arcane', 'fire', 'water']], ['Stone maul', []]]],
  ['small', [['Tide trident', ['fire']], ['Flame sword', ['water']], ['Lightning whip', ['cold']], ['Lightning whip', ['fire']]]],
];
// wand-2 and bow-maul end on a pure weapon redrawn from sheet A, so each sheet has six cells and its
// own anchor to compare against; the page uses these only as a fallback to the sheet-A crops.

function cellText(n, [w, extras]) {
  if (!extras.length) return `${n}. The plain ${w}, exactly as on the reference sheet (for comparison).`;
  const parts = extras.map((e) => MOTIF[e]);
  const zones = extras.length === 1 ? '' : ` Give each added element its own part of the weapon so they never blur together (${extras.length === 2 ? 'one on the head or blade, one on the grip or shaft' : 'head, middle and grip'}).`;
  return `${n}. ${w} + ${extras.map((e) => NAME[e]).join(' + ')}: ${BASE[w].replace(/^the |^a /, '')}, now infused with ${parts.join('; and ')}.${zones}`;
}

const index = [];
for (const [name, cells] of SHEETS) {
  const cols = cells.length <= 4 ? 2 : 3;
  const rows = Math.ceil(cells.length / cols);
  const hands = cells.some(([w]) => w === 'Healing hands');
  const refs = ['docs/reference/wizard-arms/weapons-a.jpg', ...(hands ? ['tools/sprites-3d/input/roster/wizard.png'] : [])];
  const txt = `Generate one image with your image generation tool, then save it as ${name}.png in the current directory. Reply with just the file name.

The attached images are references. The first is our approved sheet of the wizard's conjured weapons, each made of its own element: match its rendering style and finish exactly (smooth stylised toy-like shapes, chunky readable forms, simple colours, soft even lighting, plain pure white background), and keep each weapon's design from it.${hands ? " The second is our player wizard's model sheet: the Healing hands are his own hands, so match his skin, sleeves and style." : ''}

Subject: a concept sheet of elemental infusions. In our game a conjured weapon can be infused with extra elements, and each extra must show on the weapon as one bold solid feature in its own colour, readable from far away on a small screen. No loose particles, smoke, sparks or floating specks: every added element is sculpted into the weapon itself as a solid shape, so the colours stay clean and never turn into noise. The weapon's own element stays the main body; added elements are clearly secondary.

Layout: ${cells.length} weapons in an even grid of ${cols} columns and ${rows} rows, each centred in its own equal cell with generous white space round it and fully in frame, all at the same scale, shown flat from the side. No text, numbers or labels anywhere in the image. In reading order (left to right, top row first):

${cells.map((c, i) => cellText(i + 1, c)).join('\n')}
`;
  fs.writeFileSync(path.join(outDir, `${name}.txt`), txt);
  index.push({ sheet: name, cols, rows, refs, cells: cells.map(([w, extras]) => ({ weapon: w, extras })) });
}
fs.writeFileSync(path.join(here, 'sheets.json'), JSON.stringify(index, null, 1) + '\n');
console.log(index.map((s) => `${s.sheet}: ${s.cells.length} (${s.cols}x${s.rows}) refs ${s.refs.length}`).join('\n'));

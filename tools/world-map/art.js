// Painted art for the map, generated one subject at a time and placed by the generator at a fixed size.
// A landmark listed here replaces its drawn version; a sprite list replaces that ground glyph. Widths are in map units.
(function (root) {
  const LANDMARKS = { 'deep-mine': { src: 'art/deep-mine.png', w: 205 }, 'great-forge': { src: 'art/great-forge.png', w: 122 } };
  const SPRITES = { mesa: { src: 'art/mesa.png', w: 104 }, lava: { src: 'art/lava.png', w: 66 } };
  const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  const sized = (img, w, flip) => { const h = Math.round(img.height * w / img.width), c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; if (flip) { g.translate(w, 0); g.scale(-1, 1); } g.drawImage(img, 0, 0, w, h); return c; };
  const art = { landmarks: {}, sprites: {} };
  art.ready = Promise.all([
    ...Object.entries(LANDMARKS).map(async ([id, a]) => { const img = await load(a.src); if (img) art.landmarks[id] = { img, w: a.w, h: img.height * a.w / img.width }; }),
    ...Object.entries(SPRITES).map(async ([id, a]) => { const img = await load(a.src); if (img) art.sprites[id] = [sized(img, a.w), sized(img, a.w, true), sized(img, Math.round(a.w * .84), true), sized(img, Math.round(a.w * .84))]; }),
  ]);
  root.FieldArt = art;
})(window);

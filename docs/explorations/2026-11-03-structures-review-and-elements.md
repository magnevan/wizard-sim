# Structures review, and Seal as an element (2026-11-03)

The user reviewed the Structures section of the Spell Atlas (proposal C, v3). They stopped before the cell grid because their notes reshape the element set. Their notes are kept verbatim below, followed by Claude's read.

## The user's notes (verbatim)

> **Drawn rock wall / barrier** looks good. Maybe we can allow it to arc a bit if the user curves while drawing.
>
> **Stone dome / cage.** I don't like it as much, it feels kinda too much of a departure in functionality. I'm leaning towards it just drawing an arc with some default length (arc center being the caster). But it's not a very strong opinion, and I could be convinced if there's other use cases where it makes more sense.
>
> **Quick wall.** With the system I suggested above, the quick wall would be place shield + ice (no drag). Force shield + ice could be something else. I'm not totally sure what. There's some tension between shield and the new "place", since shield has meant "thing in the world" before, and place kinda does that too now. Thinking out loud I think the solution will be either by just creating new directions for shield, or maybe even revisiting the element itself "shield" is kind of an odd element compared to the others.
>
> **Ring of stone.** Seems fine... kinda same as the original
>
> **The next 4 seal variants.** There's a lot of concepts implicit here, requires some thinking. First here is my observations of what this is:
> - Seal is a modifier key. This immediately has some challenges since pressing two modifier keys at a time can be a challenge.
> - Seal + force is a turret that fires that force spell.
> - Seal + area is orbitals. They seem like they make sense, except shield is kinda weird. too similar to self cast shield. Stuff like shield + rock also seems a little weird
> - Seal + place creates a glyph. Some make sense like a fire blast. Shield variants are a little weird
> - Seal + self is kinda like preparing a spell. It halfway makes sense, I like the concept, but I feel like we need to do something more with it than just prep the elements to cast. I like the idea of it being for example some contingency spell, or a prepped burst. But I don't quite know how we can do that via some release.
> - Seal + weapon (not functional)
>
> I'm kinda feeling like seal should not be a modifier. Maybe it's an element opposite shield? Vaguely it would mean something like conjured thing that's offensive (not defensive). That seems to work ok for force, it makes turrets while avoiding the weird ones with shield. We could keep orbitals with area, and we avoid the awkward overlaps with self shield. Place -> glyph seems good. On self, I don't think it makes sense for storing a spell, because it's ambigous if for example fire+seal would store fire+seal or just fire. I think if we keep a preparation mechanism it has to be separate. One option is that we use seal+self for the buffs, while shield+self is the wards and and elements+self stays as various self "harm" casts like in the original. seal+weapon could be for offensive weapons while shield+weapon is for defensive.
>
> Btw, I'm not saying seal should be the word for it, we need to come up with vocabulary for it. This also unbalances our element count, so maybe we should add air? Then that would oppose earth. I haven't thought too much about that, but I like the symmetry.
>
> With two new elements, we may also want to trim some. I never thought steam was very interesting, it's mostly just better water. Ice is also not that necessary I think. I'm open to keeping these as well, but it just feels right to also trim back a bit to not explode complexity too much.

## Claude's read

**The proposal as a whole.** Shield and the new element form a pair: two "conjured thing" elements, one defensive (barrier) and one offensive (device). Shield stops being an odd element out: it has a partner, and the pair owns "things in the world" together. Place stays purely geometry (where it goes), and the elements decide what goes there. That resolves the Shield/Place tension the user felt, without inventing new directions for Shield.

**What it costs.**
- Keys. Today it's 8 element keys plus a Seal modifier. The draft is 10 element keys and no modifier. It drops the two-modifier chord (the user's main complaint), but Air adds a key, and 10 keys exceed Magicka's QWER/ASDF.
- Losing Seal-as-modifier loses "any spell can be stored" (traps of any element, turrets of any spell). Under the draft, the new element plus the other elements must still cover that space. As payload traits, they do: a device with fire makes a fire turret.
- Trimming Steam and Ice means water + fire and water + cold need a new rule. Making them cancel is simplest, but then water has three opposites. Treating each as two separate traits (wet and hot) is less clean.
- Ice currently carries the shard form and the ice-wall material. Earth covers both, so this is no real loss. The ice wall in the Pixel Battlefield would become a rock or ward variant.

**Smaller calls.**
- The dome is replaced by a no-drag Place shield: an arc around the caster with a default length. That becomes the quick wall. Curving the drag bends the wall.
- Force + Shield is freed up. Candidate: a shoving barrier, a short wall that slides forward along your aim and pushes bodies, then stops and stays.
- Self: the new element plus Self are buffs, Shield plus Self are wards, and other elements plus Self stay as the self-harm casts from the original. Preparing a spell is split out as its own, separate mechanism, deferred.
- Weapon: the new element makes offensive weapons, Shield makes defensive ones.

**Open.** The element's name, whether to add Air, and whether to trim Steam and Ice.

## Addendum: the user's answers

- **Steam and Ice:** don't cancel. Water + fire just gives steam effects, and water + cold gives ice effects, with no special element (as rock + fire isn't lava). Two consequences:
  1. Long collapsed combos go away. No unique spell depended on them; steam was stacked mainly because it was efficient damage.
  2. Water can no longer hide inside steam or ice to sit beside lightning. Steam + lightning was strong because wet boosts lightning, and lightning was stacked onto ice stones.
  The user is fine losing both. The combo was a cool discovery, but it narrowed the meta and made element order matter a lot.
- **Sigil** is OK as a working name.
- **Air:** hold off. Maybe a separate pass later to see what it looks like.

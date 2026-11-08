# A tenth element: the brainstorm (2026-11-08)

The user, on the World and Progression page (R3.2): "Air could make sense, but we need a brainstorm of elements and what could be cool effects to decide." Earlier: an element added late "needs to be evenly balanced, but bring some interesting unique mechanics with it", and "I really feel like I'll want to end up with an even number of elements." Written overnight, nothing decided. The page to rate it is **Tenth Element** (`tools/tenth-element/`).

## The question

Which tenth element would bring a verb the other nine don't have, fit the world of fields, read clearly for the caster and a partner, and be worth unlocking late? Pillars 2 (a language), 3 (co-op and friendly fire) and 6 (a playstyle that works everywhere).

## What the nine already own

Each element's payload trait is its verb (`tools/spell-atlas/rules-c.js`):

| Element | Verb | What it does to a body |
|---|---|---|
| Water | Soak | wets, douses, sets up freezes and conduction |
| Fire | Burn | damage over time, spreads to grass and oil |
| Cold | Chill | slows walking and attacks; freezes the wet |
| Lightning | Shock | stuns briefly, chains, jumps further through the wet |
| Arcane | Expose | wards and resistances stop counting for a moment |
| Earth | Weight | hits harder, knocks down; it's the body of a spell |
| Life | Mend | heals |
| Shield | Barrier | (form only) |
| Sigil | Device | (form only) |

**Verbs nobody owns yet:** moving bodies on purpose (Water's shove is a side effect), pulling, spreading between bodies, stopping healing, vision and hiding (only steam's mist), allegiance, time, and paying with something other than runes.

**The slot:** T is reserved above G (Earth), and Earth is the only element without an opposite on the keys (it cancels Lightning in the rules, but Lightning's key partner is Water). So the tenth element is most naturally **Earth's opposite**: whatever Earth "holds and endures", the tenth undoes. Every candidate below is framed that way.

**The late-unlock test,** from the user: balanced, unique mechanics, and (Claude adds) it should make the nine you already know *better*, not sit beside them. An element that only works alone is a poor late unlock, because by then the player's style is built from mixes.

## Nine directions

### 1. Air: what moves *(conservative; the existing draft)*
- **Verb, Gust:** shove plus carry. What's hit is pushed; clouds, flames and bodies drift with the wind.
- **In the hands:** T. A pure Air spray is a bellows gust. Air with Fire blows the flames further; Air with steam carries the cloud onto the enemy; Air with Cold slides frozen bodies into walls to shatter.
- **A partner sees:** gust streaks, clouds and fire moving the way they blow. The partner's own steam can be blown where it should go: the best co-op set-up of the lot.
- **The world:** high places, passes, steady winds; maybe what lifts airships on the steam-and-spark side.
- **Opposite Earth:** lift against weight. Clean.
- **Costs:** the draft takes the shove off Water and changes the Shield wave, so nine-element play changes on the day it's added; about +81 % spells; shoving allies is the most annoying friendly fire (pillar 3).
- **As a late unlock:** strong. It changes how every placed thing you know behaves.

### 2. Blight: what decays *(borrowed: poison in Divinity: Original Sin 2, and poison clouds across action RPGs)*
- **Verb, Rot:** a slow-building status that **spreads to bodies standing close** and **stops healing** while it lasts. Not much damage at first; it's contagion.
- **In the hands:** T. A Blight spray infects a front-liner; packed enemies pass it to each other. Blight with Water makes a festering pool; with Fire it's cleansed (fire burns rot out); with Earth it's a rotten boulder that breaks into a spreading patch.
- **A partner sees:** a green-black mottling that creeps from body to body. An infected *ally* must step away from friends or pass it on, and **Life cures it.** That gives support a cleanse job that's about timing and positioning, which pillar 3 has been missing.
- **The world:** marshes, battlefields, and land where Life has been drained. In story spine B (the shifting fields) it could be what's left where a field dies, so it's the land's wound before it's a tool.
- **Opposite Earth:** decay against endurance. It could pair with Life instead, but Life's partner is Arcane.
- **Costs:** a second damage-over-time beside burning (keep its damage low, its spreading high); one more status to read on bodies; the darkest tone of the set, which suits classic fantasy.
- **As a late unlock:** strong, and with a story hook: you might first meet it as the enemy's magic.

### 3. Void: what's absent
- **Verb, Draw:** pulls bodies and shots toward the point of impact, and swallows projectiles.
- **In the hands:** T. Void Place is a well that gathers a crowd for a moment, the set-up for any nova or blast. Void Force is a tether that yanks one target to you. Shield with Void is a barrier that eats shots instead of blocking them.
- **A partner sees:** a dark lens bending the floor toward it. The best combo enabler (pull, then a partner's Earth nova), and the most dangerous friendly fire (pulling an ally into it).
- **The world:** hollows where a field has been drawn dry: the overtap's scars (spine C), or the end state of a shifting field (B).
- **Opposite Earth:** absence against substance.
- **Costs:** it overlaps Arcane's "deep, dangerous" identity, so the two would need clear lines; pulling is strong crowd control, and has to be short.
- **As a late unlock:** good: it multiplies every area spell.

### 4. Light: what reveals
- **Verb, Dazzle:** blinds (an enemy loses its target, swings wide, archers miss) and reveals what's hidden.
- **In the hands:** a flash cone, a lantern Place that lights a dark room, a ward that dazzles whoever hits it.
- **A partner sees:** a bright flash; a blinded ally's aim drifts for a moment.
- **The world:** sun plateaus, deserts, lighthouses. Darkness could become a zone that Light pushes back.
- **Costs:** "blinded" is another disable beside stun and chill; vision effects are hard to read in a busy top-down fight.
- **As a late unlock:** medium. Best if the campaign has dark places.

### 5. Iron: what binds metal
- **Verb, Magnetize:** marked bodies pull toward each other and draw shots; it carries lightning through rock.
- **Costs:** too close to Earth (both are stuff from the ground), and armour as a world rule would be needed for it to matter. Weak.

### 6. Sound: what resonates
- **Verb, Resonate:** shatters brittle things (frozen bodies, rock, barriers) and interrupts wind-ups in a wide ring, through walls.
- **Costs:** shattering is Earth's and Arcane's already, interrupting is Lightning's. It's a mix of existing verbs, so it fails the "unique" test.

### 7. Time: what passes *(wild)*
- **Verb, Tempo:** slows or quickens whatever it touches (a wind-up, a projectile, an ally's recovery), and a self-cast rewinds you two seconds.
- **Costs:** Cold already slows and Haste already quickens; a rewind is a huge rule in rollback-netcode co-op (deterministic, but strange to watch from a partner's screen). Unique, but readability is poor.

### 8. Spirit: what wills *(wild)*
- **Verb, Sway:** an enemy is turned to your side for a few seconds.
- **The world:** graveyards, old battlefields; or a third innate element (and then there'd be eleven).
- **Costs:** allegiance flips are confusing in co-op (whose side is it on, and can my friend hit it?); it overlaps the Double. Memorable, but noisy.

### 9. Blood: what's paid *(wild; borrowed: blood magic from Dragon Age and Path of Exile)*
- **Verb, Leech:** a Blood rune has no pool. It costs health to queue, and its payload heals you for part of what it deals.
- **In the hands:** a way to cast past an empty pool, at your own risk. Self-cast is a pact: a burst of regen for health.
- **Costs:** it bends the rune economy, which the game is built on; leeching from an ally under friendly fire is ugly. A strong theme, but a dangerous rule.

### And the opposite move: eight, not ten *(conservative)*
Even by subtraction. Fold one element into another, for example Arcane's Expose into Lightning. It's cheaper in keys and spells, but it removes something already built and rated, and costs the Life–Arcane pair. Listed so it's on the table; not recommended.

## Converge

| Direction | Unique verb? | Makes the nine better? | World fit | Co-op | Readability | Cost |
|---|---|---|---|---|---|---|
| Air | yes, motion | yes, routes clouds and fire | winds, heights | best set-ups; annoying shoves | good (streaks) | changes Water and the Shield wave |
| Blight | yes, contagion and anti-heal | yes, gives Life a cure job | drained land, story B | cleanse as support skill | medium (one more status) | a second damage-over-time |
| Void | yes, pull | yes, sets up every area spell | hollows, story B/C | great combos, harsh friendly fire | good (lens) | overlaps Arcane's identity |
| Light | partly (blind) | a little | sun, darkness | flash on allies | poor in a busy fight | another disable |
| Iron, Sound | no | no | weak | | | overlap |
| Time, Spirit, Blood | yes | not really | varied | noisy | poor | big rules |

**The three strongest:**
1. **Air,** the safe, rich choice: the most co-op set-ups, and it makes placed things move. Its cost is changing two things already built.
2. **Blight,** the most interesting new mechanic: spreading rewards herding and punishes clumping, and Life gets a cure job, which addresses the open question of skillful support. It also has the best story hook (the land's wound, met first as the enemy's).
3. **Void,** the strongest combo enabler, if its line with Arcane can be drawn.

**Claude's lean:** Blight, closely followed by Air. Air is the stronger mechanic for spell routing, but Blight brings something the game doesn't have at all (contagion, curing) and fits the story better as a *late* unlock. Not a decision: the user's taste decides.

**A combination worth noting:** Air and Void are each other's natural opposites (push and pull). If the game ever went to twelve elements, they're a pair; at ten, only one fits, and it would face Earth.

## Questions for the user

1. **Which verb excites you most:** motion (Air), contagion (Blight), pull (Void), or another?
2. **Should the late element be met first as the enemy's magic,** then learned?
3. **Should Life gain a cure job** (cleansing a status), whatever the tenth is?
4. **Air's cost:** is it all right that Water loses its shove and the Shield wave changes on the day Air is added?

## Smallest test

The same corridor for each finalist: a pack of melee enemies, one ally, a fire patch and a steam cloud on the floor. With only the new element and two others, does a player find the element's best trick without being told, and can a partner read it in the same frame?

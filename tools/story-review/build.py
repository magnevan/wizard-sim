"""Builds index.html for the story review from the finished candidates in docs/explorations/2026-11-09-story/candidates."""
import html, pathlib, re

HERE = pathlib.Path(__file__).parent
CAND = HERE.parent.parent / "docs/explorations/2026-11-09-story/candidates"


def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    t = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", t)
    return t


def md(text, skip_title=True):
    out, para, items, rows = [], [], [], []
    def flush():
        nonlocal para, items, rows
        if para:
            out.append("<p>" + inline(" ".join(para)) + "</p>"); para = []
        if items:
            out.append("<ul>" + "".join(f"<li>{inline(i)}</li>" for i in items) + "</ul>"); items = []
        if rows:
            head, *body = [r for r in rows if not re.fullmatch(r"[\s|:-]+", r)]
            cells = lambda r: [c.strip() for c in r.strip().strip("|").split("|")]
            t = "<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in cells(head)) + "</tr></thead><tbody>"
            t += "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells(r)) + "</tr>" for r in body)
            out.append(f'<div class="scroll"><table>{t}</tbody></table></div>'); rows = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            flush(); continue
        m = re.match(r"(#{1,3}) (.*)", s)
        if m:
            flush()
            if len(m[1]) == 1 and skip_title:
                continue
            out.append(f"<h{len(m[1]) + 2}>{inline(m[2])}</h{len(m[1]) + 2}>"); continue
        if s.startswith("- "):
            if para: flush()
            items.append(s[2:]); continue
        if s.startswith("|"):
            if para or items: flush()
            rows.append(s); continue
        if items or rows: flush()
        para.append(s)
    flush()
    return "\n".join(out)


def body(name):
    return md((CAND / f"{name}-r3.md").read_text(encoding="utf8"))


STOPS = [("★", 690, 455, "Pennick, the school"), ("1", 768, 235, "Saltcrown"), ("2", 240, 670, "The great tree"), ("3", 700, 880, "The Stirrup and Cullet"), ("4", 1115, 205, "Longlegs"), ("5", 435, 75, "The Ribs"), ("6", 312, 372, "Twice"), ("7", 1250, 505, "The Rucks")]
route = " ".join(f"{x},{y}" for _, x, y, _ in STOPS)
marks = "".join(f'<g transform="translate({x} {y})"><title>{t}</title><circle r="27"/><text y="10">{n}</text></g>' for n, x, y, t in STOPS)

QUESTIONS = [
    ("q-1-pick", "Which story should we carry forward?", "Recommended: Your Go. It's the only one where getting stronger is the plot, and it's the cheapest to build. Your own taste matters more than the judges' here, because the creator judge preferred The Flitting Year.", ["Your Go", "The Flitting Year", "Before All the People", "What He Had on Him", "A mix"]),
    ("q-2-wells", "Your Go treats the wells as stops on the way to the next spar. You said attuning to one element at a time was the part you liked. Should attunement get a bigger role?", "Recommended: yes. Each attunement becomes the moment the region's element changes how you fight, with a local rite you remember, and the rivals attune beside you so it stays part of the contest.", ["Yes, make it central", "A little", "Leave it"]),
    ("q-3-graft", "The judges each suggested stealing one idea. Which would you want?", "Recommended: the defence that runs without you (from Before All the People). You build a span, you sail, and when you return it stood or fell by your layout, with named families' houses gone where it failed. It answers the story's stated weakness, a back half without much bite.", ["Defence that runs without you", "A long supper each leg (already in Your Go)", "Fields that really move (from The Flitting Year)", "Spells as forensics (from What He Had on Him)", "None"]),
    ("q-4-tone", "How does the emotional register sit with you? Your Go is light and affectionate until it hurts, and nothing threatens the world.", "Recommended: keep it. If it needs more weight, add it locally, as the burned house at midsummer already does.", ["Right as it is", "Needs a larger threat", "Needs to be lighter"]),
    ("general", "Anything else?", "", []),
]


def question(qid, q, rec, opts):
    chips = "".join(f'<button type="button" data-v="{html.escape(o)}" aria-pressed="false">{html.escape(o)}</button>' for o in opts)
    return f'''<div class="q" data-q="{qid}"><h4>{html.escape(q)}</h4>{f'<p class="rec">{html.escape(rec)}</p>' if rec else ''}{f'<div class="chips">{chips}</div>' if opts else ''}
<label class="sr" for="n-{qid}">Your note</label><textarea id="n-{qid}" rows="3" placeholder="Your note"></textarea><div class="saved" aria-live="polite"></div></div>'''


def rival(title, pitch, angle, scores, love, wince, name):
    return f'''<article class="card"><h3>{title}</h3><p class="pitch">{pitch}</p><p class="meta">{angle} · {scores}</p>
<dl><dt>Best of it</dt><dd>{love}</dd><dt>The problem</dt><dd>{wince}</dd></dl>
<details><summary>Read the whole story</summary><div class="story">{body(name)}</div></details></article>'''


PAGE = f'''<title>Four Roads Round the Sea</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,700;1,400&family=Alegreya+Sans:wght@400;500;700&family=IM+Fell+English+SC&display=swap">
<style>
/* Layout: one reading column on the sea's own blue, with the painted map as the one big object. A single dark look. */
:root {{ --sea:#0f222e; --deep:#0a1820; --panel:#17303f; --rule:#31505f; --fg:#ece4d3; --muted:#a9bac2; --lamp:#efbd6b; --display:"IM Fell English SC",Georgia,serif; --read:"Alegreya",Georgia,serif; --ui:"Alegreya Sans","Segoe UI",sans-serif; color-scheme:dark; }}
body {{ background:var(--sea); color:var(--fg); font:18px/1.55 var(--read); padding-left:max(16px,env(safe-area-inset-left,0px)); padding-right:max(16px,env(safe-area-inset-right,0px)); padding-block:32px 72px; }}
main {{ max-width:720px; margin:0 auto; display:grid; gap:44px; }}
main > * {{ min-width:0; }}
h1,h2,h3 {{ font-family:var(--display); font-weight:400; text-wrap:balance; letter-spacing:.02em; margin:0; }}
h1 {{ font-size:clamp(34px,7vw,52px); line-height:1.05; }}
h2 {{ font-size:30px; line-height:1.15; }}
h3 {{ font-size:25px; }}
p {{ margin:0; }}
.lede {{ font-size:21px; margin-top:12px; }}
.ui,.meta,.saved,dt,table,.chips,summary {{ font-family:var(--ui); }}
.meta {{ color:var(--muted); font-size:15.5px; }}
section {{ display:grid; gap:16px; }}
figure {{ margin:0; position:relative; }}
figure img {{ display:block; width:100%; height:auto; border-radius:3px; }}
figure svg {{ position:absolute; inset:0; width:100%; height:100%; }}
figcaption {{ color:var(--muted); font:15.5px/1.4 var(--ui); margin-top:8px; }}
.line {{ fill:none; stroke:#fff5dd; stroke-width:4; stroke-dasharray:3 13; stroke-linecap:round; }}
svg circle {{ fill:#10222d; stroke:var(--lamp); stroke-width:4; }}
svg text {{ fill:var(--lamp); font:700 28px var(--ui); text-anchor:middle; }}
.scroll {{ overflow-x:auto; }}
table {{ border-collapse:collapse; width:100%; font-size:16px; font-variant-numeric:tabular-nums; }}
th,td {{ text-align:left; padding:6px 10px; border-bottom:1px solid var(--rule); vertical-align:top; }}
th {{ color:var(--muted); font-weight:500; }}
tr.win td {{ color:var(--lamp); font-weight:700; }}
.story {{ display:grid; gap:12px; min-width:0; }}
.story h3,.story h4,.story h5 {{ font-family:var(--display); font-weight:400; margin:14px 0 0; letter-spacing:.02em; }}
.story h3 {{ font-size:26px; }} .story h4 {{ font-size:24px; }} .story h5 {{ font-size:20px; color:var(--lamp); }}
.story ul {{ margin:0; padding-left:20px; display:grid; gap:4px; }}
.points {{ margin:0; padding-left:20px; display:grid; gap:10px; }}
.card {{ background:var(--panel); padding:20px; border-radius:4px; display:grid; gap:10px; }}
.pitch {{ font-size:19px; }}
dl {{ margin:0; display:grid; gap:4px; }}
dt {{ color:var(--lamp); font-size:15.5px; font-weight:700; margin-top:6px; }}
dd {{ margin:0; }}
details summary {{ cursor:pointer; color:var(--lamp); padding:4px 0; }}
details[open] summary {{ margin-bottom:10px; }}
.q {{ display:grid; gap:10px; padding-block:18px; border-top:1px solid var(--rule); }}
.q h4 {{ font:700 20px/1.3 var(--read); margin:0; }}
.rec {{ color:var(--muted); }}
.chips {{ display:flex; flex-wrap:wrap; gap:6px; }}
.chips button {{ font:inherit; font-size:15.5px; color:var(--fg); background:var(--deep); border:1px solid var(--rule); padding:4px 11px; border-radius:4px; cursor:pointer; }}
.chips button:hover {{ border-color:var(--lamp); }}
.chips button[aria-pressed=true] {{ background:var(--lamp); border-color:var(--lamp); color:#1e1508; font-weight:700; }}
button:focus-visible,textarea:focus-visible,summary:focus-visible {{ outline:2px solid var(--lamp); outline-offset:2px; }}
textarea {{ font:16px/1.4 var(--ui); color:var(--fg); background:var(--deep); border:1px solid var(--rule); border-radius:4px; padding:8px 10px; width:100%; box-sizing:border-box; resize:vertical; }}
.saved {{ color:var(--muted); font-size:14.5px; min-height:1.3em; }}
.sr {{ position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }}
</style>

<main>
<header>
<h1>Four Roads Round the Sea</h1>
<p class="lede">Four stories for the journeyman's circuit, each revised three times with its own editors. Three judges read them blind and picked one.</p>
<p class="meta" style="margin-top:10px">Options for you to react to, none of it canon. Names and places are placeholders on a stand-in map.</p>
</header>

<section>
<h2>The winner: Your Go</h2>
<p class="pitch">Two tiny schools send their journeymen round the wells in the same summer. You spend it trying to beat four people who are cleverer than you, funnier than you, and all going to leave.</p>
<figure>
<img src="map.jpg" alt="The painted world map, with the route of Your Go marked on it" width="1402" height="1122">
<svg viewBox="0 0 1402 1122" aria-hidden="true"><polyline class="line" points="{route}"/>{marks}</svg>
<figcaption>The route: the school, then seven lands in order. Hover a number for its name.</figcaption>
</figure>
</section>

<section>
<h2>How the judges saw it</h2>
<div class="scroll"><table>
<thead><tr><th>Story</th><th>Player</th><th>Builder</th><th>Creator</th><th>Total</th></tr></thead>
<tbody>
<tr class="win"><td>Your Go</td><td>45 (1st)</td><td>39 (1st)</td><td>38 (2nd)</td><td>122</td></tr>
<tr><td>The Flitting Year</td><td>38 (2nd)</td><td>28 (3rd)</td><td>41 (1st)</td><td>107</td></tr>
<tr><td>Before All the People</td><td>32 (4th)</td><td>32 (2nd)</td><td>37 (3rd)</td><td>101</td></tr>
<tr><td>What He Had on Him</td><td>35 (3rd)</td><td>21 (4th)</td><td>28 (4th)</td><td>84</td></tr>
</tbody></table></div>
<p class="meta">Each score is out of 50. The player judged what they'd want to play, the builder what a tiny team could ship, and the creator what you'd most want to make yours.</p>
<ul class="points">
<li><strong>Why it won.</strong> It's the only story where getting stronger is the plot. You lose to someone pressing the same keys you have, and the spell goes in your copybook. Every town keeps a slate of scores, so old regions stay worth revisiting for almost no extra content.</li>
<li><strong>Its main problem for you.</strong> The creator judge's sharpest note: "the wells barely matter". Attuning is a job on the way to the next spar, and you said attuning was the part you liked. See question 2.</li>
<li><strong>Its biggest risk.</strong> The four rivals have to be fun to lose to, grow every region, and read clearly beside up to four players. If they play badly, the game has no spine. The builder judge didn't check what the enemy AI can do today, so this is untested.</li>
<li><strong>Back half.</strong> The player judge worried it goes slack when you're alone and the threat is a thing wearing a bell. See question 3.</li>
</ul>
</section>

<section>
<h2>Your Go, in full</h2>
<div class="story">{body('rival')}</div>
</section>

<section>
<h2>The runners-up</h2>
{rival('The Flitting Year', 'Once in 211 years every field in the world moves one seat around the great sea, on a published date, and two million people, a flying school and a herd that takes nine days to pass must move with them.', 'The event on the calendar', '107', 'It alone extends your world rather than plotting over it: magic runs like climate, so the climate moves. Every land becomes two lands, and four thousand people on folding chairs applaud the volcano going out.', 'Arrive, choose, ride the front, six times over. You risk feeling like logistics, not a wizard, and it would be the most expensive of the four to build.', 'season')}
{rival('Before All the People', 'To attune at each well you give your word before the people who live on it, and the circuit becomes the long road back to pay them, until what you swore to one people you can keep only by failing another.', 'The promises', '101', 'The circuit can\’t be removed from it. Oaths reach right into your hands, as with no Fire past the ford "if anyone saw it burning". The closing song is the most powerful scene in any of the four.', 'A solemn game about debt. Foresight changes how the losers lose but never who loses, and friends won\’t want to vote on land-use wording on a Friday.', 'oath')}
{rival('What He Had on Him', 'An old man drowns with seven objects in his pockets, one from each land on the circuit. You are going to all of them, and your hands can make evidence talk.', 'The case', '84', 'Spells as forensics is a real discovery, worth stealing whatever happens: frost showing where hands gripped. It had the strongest hook of the four.', 'Your growth is beside the point, it\’s spent after one playthrough, and in a party one person reads while three wait. It\’s also the hardest to cut down or make your own.', 'case')}
</section>

<section>
<h2>Your reactions</h2>
<p class="meta">Saved as you go. Anything you leave blank means the recommendation stands.</p>
<div>{"".join(question(*q) for q in QUESTIONS)}</div>
</section>

<section>
<h2>How different they really are</h2>
<p>The overlap checker's final verdict: four distinct games in four distinct voices, with small collisions left over. The first drafts had very different premises but read like one author, with the same deflated landmarks, the same dry voice and the same water finale, so each writer was given a separate voice and a private list of things to replace. Two habits survived: grand landmarks with one uncanny rule, and in the second round every last fight happening at the fen. Three of the four finales were moved for the final draft.</p>
<p>All the writers and judges are Claude models, and the four starting angles were chosen by Claude, so a fifth kind of story you'd have thought of won't be here. The editors' notes and overlap reports are in <code>docs/explorations/2026-11-09-story/</code>.</p>
</section>
</main>

<script>
const use = (n) => (window.claude && window.claude.use ? window.claude.use(n) : Promise.resolve(null));
const blocks = [...document.querySelectorAll('.q')];
use('db').then((db) => {{
  const coll = db && db.collection('answers');
  if (!coll) {{ blocks.forEach((b) => {{ b.querySelector('.saved').textContent = 'Your answers can\\'t be saved in this view.'; }}); return; }}
  const state = {{}};
  const paint = (b) => {{ const s = state[b.dataset.q] || {{}}; b.querySelectorAll('.chips button').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v === s.choice)); }};
  let timers = {{}};
  const save = (b) => {{
    const id = b.dataset.q; clearTimeout(timers[id]);
    timers[id] = setTimeout(async () => {{
      const line = b.querySelector('.saved');
      try {{ await coll.doc(id).set(state[id]); line.textContent = 'Saved'; }}
      catch {{ line.textContent = 'Could not save that. Check your connection and try again.'; }}
    }}, 400);
  }};
  blocks.forEach((b) => {{
    const id = b.dataset.q, t = b.querySelector('textarea');
    t.oninput = () => {{ state[id] = {{ ...state[id], note: t.value }}; save(b); }};
    b.querySelectorAll('.chips button').forEach((c) => c.onclick = () => {{ const on = (state[id] || {{}}).choice === c.dataset.v; state[id] = {{ ...state[id], choice: on ? '' : c.dataset.v }}; paint(b); save(b); }});
  }});
  coll.onSnapshot((snap) => {{
    for (const d of snap.docs) {{
      if (timers[d.id] && document.activeElement && document.activeElement.closest('[data-q="' + d.id + '"]')) continue;
      const b = blocks.find((x) => x.dataset.q === d.id); if (!b) continue;
      state[d.id] = d.data(); paint(b);
      const t = b.querySelector('textarea'); if (document.activeElement !== t) t.value = state[d.id].note || '';
    }}
  }}, () => {{}});
}});
</script>
'''

(HERE / "index.html").write_text(PAGE, encoding="utf8", newline="\n")
print(len(PAGE))

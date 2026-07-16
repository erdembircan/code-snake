# code-snake

Snake, played inside the program's own source code. **The code is the board.**

No sprites, no box-drawing characters, no pixels. When code-snake starts, it reads
its own source file, minifies it, and lays it out as fully justified text filling
an exact rectangle. The snake exists only as *absence*: words are pushed together
and apart every frame so that a channel of whitespace moves through the live code.
Eat, and the program's text makes room for you.

## Code as medium

Most programs treat their source as an implementation detail — the thing you look
at only when something breaks. Here the source is the material itself: the canvas,
the playfield, and the collision geometry are all the same bytes that implement
them. Edit the code and the board changes, because the board *is* the code.

The file never reproduces itself (this is not a quine — it reads its own file,
the canonical quine "cheat"). It consumes itself: `readFileSync(__filename)`,
then the text is tokenized and reflowed around the game state, sixty-ish times
a minute.

## Run

```sh
node snake.js
```

Requires an interactive terminal and Node.js. No dependencies.

| Keys | |
|---|---|
| arrows / `wasd` / `hjkl` | move |
| `p` | pause |
| `r` | restart |
| `q` / `Ctrl-C` | quit |

### Flags

| Flag | Effect |
|---|---|
| `--green` | paint the snake body green instead of pure whitespace |
| `--smoke [cols rows]` | render a single frame headless and exit (testing) |

## How the layout works

Every frame is a full reflow of the entire source through the field — one
continuous token stream, no static lines. Three nested distributions, each using
the same Bresenham-style error accumulator (`floor(E·i/n) − floor(E·(i−1)/n)`):

1. **Across rows** — each row receives a character quota proportional to its free
   width (total width minus whatever the snake and food carve out of that row).
   A snake anywhere shifts every row's quota slightly, so a disturbance is
   absorbed by the whole page instead of cratering one line.
2. **Across segments** — within a row, words are distributed over the free
   segments between carved spans, proportional to segment widths.
3. **Within segments** — classic full justification: leftover slack is spread
   over the word gaps, never differing by more than one space.

Words that don't fit a boundary are hard-broken and carried into the next
segment or row, so text stays dense even beside a snake hugging the field edge.
The result is a structural invariant: every row is exactly the same width, every
frame — the field is always a perfect rectangle, flush on all four edges.

The field's size comes from the content, not the screen: width ≈
`sqrt(chars × 5)`, height from a wrap simulation, plus a sliver of slack that the
snake "borrows" as it grows. On a large monitor the field keeps its natural size,
centered. The source renders exactly once — no tiling, no repetition.

A built-in minifier (string-literal-aware, so the code's own text survives
verbatim) strips the spaces that justification doesn't need, then re-chunks long
runs at punctuation so justification keeps its seams.

## Honest limits

Grow long enough and the carved area exceeds the layout slack: the final tokens
fall off the bottom row. The snake eats the code. This is considered thematically
correct behavior.

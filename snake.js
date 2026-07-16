#!/usr/bin/env node
'use strict';

const fs = require('fs');

const SOURCE = fs.readFileSync(__filename, 'utf8');
const PUNCT = new Set('{}()[];,=+-*/<>!&|?:.'.split(''));

function minify(src) {
  let out = '';
  let q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { out += c; if (c === q && src[i - 1] !== '\\') q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; out += c; continue; }
    if (/\s/.test(c)) {
      while (i + 1 < src.length && /\s/.test(src[i + 1])) i++;
      const prev = out[out.length - 1];
      const next = src[i + 1];
      if (prev && next && !PUNCT.has(prev) && !PUNCT.has(next)) out += ' ';
      continue;
    }
    out += c;
  }
  return out;
}

function chunk(token) {
  const MAX = 14;
  const parts = [];
  let rest = token;
  while (rest.length > MAX) {
    let cut = -1;
    for (let i = MAX; i >= 4; i--) if (PUNCT.has(rest[i - 1])) { cut = i; break; }
    if (cut === -1) cut = MAX;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

const TOKENS = minify(SOURCE).split(/\s+/).filter(Boolean).flatMap(chunk);
const CHAR_TOTAL = TOKENS.reduce((a, w) => a + w.length, 0);

const CELL_W = 5;
const CELL_H = 2;

function wrapRows(width) {
  let rows = 1;
  let used = 0;
  for (const word of TOKENS) {
    let len = word.length;
    while (len > width) { rows++; len -= width; }
    const need = (used ? 1 : 0) + len;
    if (used + need <= width) used += need;
    else { rows++; used = len; }
  }
  return rows;
}

let cols = 0;
let gw = 0;
let gh = 0;
let marginX = 0;
let marginY = 0;

function measure(fallbackCols, fallbackRows) {
  const rawCols = process.stdout.columns || fallbackCols || 80;
  const rawRows = process.stdout.rows || fallbackRows || 24;
  const idealW = Math.round(Math.sqrt(CHAR_TOTAL * 5));
  gw = Math.max(8, Math.floor(Math.min(idealW, rawCols) / CELL_W));
  cols = gw * CELL_W;
  gh = Math.max(6, Math.ceil(wrapRows(cols) / CELL_H) + 1);
  const maxGh = Math.floor((rawRows - 1) / CELL_H);
  if (gh > maxGh) gh = Math.max(6, maxGh);
  marginX = Math.max(0, Math.floor((rawCols - cols) / 2));
  marginY = Math.max(0, Math.floor((rawRows - 1 - gh * CELL_H) / 2));
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

let snake = [];
let dir = 'right';
let pending = [];
let food = null;
let grow = 0;
let score = 0;
let dead = false;
let paused = false;
let tickMs = 160;
let timer = null;

function reset() {
  const cy = Math.floor(gh / 2);
  const cx = Math.floor(gw / 2);
  snake = [];
  for (let i = 0; i < 4; i++) snake.push([cx - i, cy]);
  dir = 'right';
  pending = [];
  grow = 0;
  score = 0;
  dead = false;
  paused = false;
  tickMs = 160;
  placeFood();
}

function onSnake(x, y) {
  return snake.some(([sx, sy]) => sx === x && sy === y);
}

function placeFood() {
  let x, y;
  do {
    x = Math.floor(Math.random() * gw);
    y = Math.floor(Math.random() * gh);
  } while (onSnake(x, y));
  food = [x, y];
}

function tick() {
  if (dead || paused) return;
  while (pending.length) {
    const next = pending.shift();
    if (next !== dir && next !== OPPOSITE[dir]) { dir = next; break; }
  }
  const [dx, dy] = DIRS[dir];
  const head = [snake[0][0] + dx, snake[0][1] + dy];
  const [hx, hy] = head;
  if (hx < 0 || hy < 0 || hx >= gw || hy >= gh || onSnake(hx, hy)) {
    dead = true;
    draw();
    return;
  }
  snake.unshift(head);
  if (hx === food[0] && hy === food[1]) {
    score++;
    grow += 2;
    tickMs = Math.max(70, tickMs - 5);
    placeFood();
  }
  if (grow > 0) grow--; else snake.pop();
  draw();
}

function loop() {
  clearTimeout(timer);
  tick();
  timer = setTimeout(loop, tickMs);
}

let ti = 0;
let carry = [];

function nextWord() {
  if (carry.length) return carry.shift();
  if (ti >= TOKENS.length) return null;
  return TOKENS[ti++];
}

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const FOOD_MARK = '\x1b[0;48;5;157m' + ' '.repeat(CELL_W) + RESET + DIM;

const GREEN_BODY = process.argv.includes('--green');

function bodyMark(width) {
  if (!GREEN_BODY) return ' '.repeat(width);
  return '\x1b[0;48;5;34m' + ' '.repeat(width) + RESET + DIM;
}

function rowMarks(y) {
  const gy = Math.floor(y / CELL_H);
  const marks = [];
  for (const [sx, sy] of snake) {
    if (sy !== gy) continue;
    marks.push({ s: sx * CELL_W, e: sx * CELL_W + CELL_W, t: 'body' });
  }
  if (food && food[1] === gy) {
    marks.push({ s: food[0] * CELL_W, e: food[0] * CELL_W + CELL_W, t: 'food' });
  }
  marks.sort((a, b) => a.s - b.s);
  const merged = [];
  for (const m of marks) {
    const last = merged[merged.length - 1];
    if (last && last.t === 'body' && m.t === 'body' && m.s <= last.e) last.e = m.e;
    else merged.push({ ...m });
  }
  return merged;
}

function justifySeg(seg) {
  if (seg.w <= 0) return '';
  if (seg.words.length === 0) return ' '.repeat(seg.w);
  const extra = seg.w - seg.used;
  const gaps = seg.words.length - 1;
  if (gaps === 0) return seg.words[0] + ' '.repeat(extra);
  let out = seg.words[0];
  let prev = 0;
  for (let i = 1; i <= gaps; i++) {
    const acc = Math.floor((extra * i) / gaps);
    out += ' '.repeat(1 + acc - prev) + seg.words[i];
    prev = acc;
  }
  return out;
}

function layoutRow(marks, quota) {
  const pieces = [];
  let pos = 0;
  for (const m of marks) {
    pieces.push({ seg: true, w: m.s - pos, words: [], used: 0 });
    pieces.push({ seg: false, m });
    pos = m.e;
  }
  pieces.push({ seg: true, w: cols - pos, words: [], used: 0 });
  const segs = pieces.filter(p => p.seg && p.w > 0);
  const rowWords = [];
  let want = 0;
  while (want < quota) {
    const word = nextWord();
    if (word === null) break;
    rowWords.push(word);
    want += word.length;
  }
  const totalW = segs.reduce((a, s) => a + s.w, 0);
  let cumW = 0;
  let consumed = 0;
  let wi = 0;
  for (const seg of segs) {
    cumW += seg.w;
    const target = Math.floor((want * cumW) / totalW) - consumed;
    let got = 0;
    while (wi < rowWords.length && got < target) {
      const word = rowWords[wi];
      const sep = seg.words.length ? 1 : 0;
      if (seg.used + sep + word.length <= seg.w) {
        seg.words.push(word);
        seg.used += sep + word.length;
        got += word.length;
        wi++;
      } else {
        const room = seg.w - seg.used - sep;
        if (room >= 3) {
          seg.words.push(word.slice(0, room));
          seg.used += sep + room;
          got += room;
          rowWords[wi] = word.slice(room);
        }
        break;
      }
    }
    consumed += got;
  }
  if (wi < rowWords.length) carry = rowWords.slice(wi).concat(carry);
  let line = '';
  for (const p of pieces) {
    if (p.seg) line += justifySeg(p);
    else line += p.m.t === 'food' ? FOOD_MARK : bodyMark(p.m.e - p.m.s);
  }
  return { line, consumed };
}

function renderFrame() {
  ti = 0;
  carry = [];
  const H = gh * CELL_H;
  const marksByRow = [];
  const freeW = [];
  let totalFree = 0;
  for (let y = 0; y < H; y++) {
    const m = rowMarks(y);
    const carved = m.reduce((a, k) => a + (k.e - k.s), 0);
    marksByRow.push(m);
    freeW.push(cols - carved);
    totalFree += cols - carved;
  }
  const lines = [];
  let cumFree = 0;
  let assigned = 0;
  for (let y = 0; y < H; y++) {
    cumFree += freeW[y];
    const quota = Math.floor((CHAR_TOTAL * cumFree) / totalFree) - assigned;
    const r = layoutRow(marksByRow[y], quota);
    assigned += r.consumed;
    lines.push(r.line);
  }
  return lines;
}

function statusLine() {
  const left = dead
    ? `  DEAD — score ${score} — press r to restart, q to quit`
    : paused
      ? `  PAUSED — score ${score} — press p to resume`
      : `  score ${score}   length ${snake.length}`;
  const right = 'arrows/wasd move · p pause · r restart · q quit  ';
  const pad = Math.max(1, cols - left.length - right.length);
  return (left + ' '.repeat(pad) + right).slice(0, cols);
}

function draw() {
  const pad = ' '.repeat(marginX);
  const lines = renderFrame().map(l => pad + l);
  const frame =
    '\x1b[H' + '\n'.repeat(marginY) + DIM + lines.join('\n') + RESET +
    '\n' + pad + '\x1b[7m' + statusLine() + RESET;
  process.stdout.write(frame);
}

function enterScreen() {
  process.stdout.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H');
}

function leaveScreen() {
  process.stdout.write('\x1b[?25h\x1b[?1049l');
}

function quit(code) {
  clearTimeout(timer);
  leaveScreen();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.exit(code || 0);
}

const KEYMAP = {
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
  w: 'up', s: 'down', d: 'right', a: 'left',
  k: 'up', j: 'down', l: 'right', h: 'left',
};

function onInput(buf) {
  let data = buf.toString('utf8');
  while (data.length) {
    let key;
    if (data.startsWith('\x1b[')) { key = data.slice(0, 3); data = data.slice(3); }
    else { key = data[0]; data = data.slice(1); }
    if (key === '\x03' || key === 'q') quit(0);
    else if (key === 'p' && !dead) { paused = !paused; draw(); }
    else if (key === 'r') { reset(); draw(); }
    else if (KEYMAP[key] && !dead && !paused) {
      if (pending.length < 3) pending.push(KEYMAP[key]);
    }
  }
}

function main() {
  const smokeAt = process.argv.indexOf('--smoke');
  if (smokeAt !== -1) {
    const w = parseInt(process.argv[smokeAt + 1], 10);
    const h = parseInt(process.argv[smokeAt + 2], 10);
    measure(w > 0 ? w : 100, h > 0 ? h : 30);
    reset();
    process.stdout.write(renderFrame().join('\n') + '\n' + statusLine() + '\n');
    return;
  }
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    process.stderr.write('code-snake needs an interactive terminal (or run with --smoke)\n');
    process.exit(1);
  }
  measure();
  reset();
  enterScreen();
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', onInput);
  process.stdout.on('resize', () => { measure(); reset(); process.stdout.write('\x1b[2J'); draw(); });
  process.on('SIGTERM', () => quit(0));
  process.on('SIGINT', () => quit(0));
  draw();
  timer = setTimeout(loop, tickMs);
}

main();

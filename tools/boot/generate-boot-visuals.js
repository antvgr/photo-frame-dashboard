// Animation + logo de démarrage "C&A Home Screen", conçus pour un affichage d'environ 6 images/s (limite matérielle mesurée du cadre).
const fs = require('fs');
const zlib = require('zlib');
const { createCanvas, Path2D } = require('@napi-rs/canvas');

const OUT = require('path').join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const W = 1280, H = 800, FPS = 6, N = 12;           // images 0..N-1 ; la dernière est l'image finale (reprise en boucle, part1)
const BG = '#0E0E0F', CREAM = '#D8D3C8', ORANGE = '#FF7A1A', BLUE = '#2D5BFF';
const NAME = 'C&A Home Screen';

const icons = fs.readFileSync(require('path').join(__dirname, '../../dashboard/js/icons.js'), 'utf8');
const hm = /home: \{ w: (\d+), h: (\d+), d: '([^']+)'/.exec(icons);
const HOUSE = { w: +hm[1], h: +hm[2], path: new Path2D(hm[3]) };    // Font Awesome Free 6.7.2 "house", CC BY 4.0

function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
const rnd = rng(11);
const PARTS = Array.from({ length: 30 }, () => ({
  a: rnd() * Math.PI * 2, d: 170 + rnd() * 380, r: 5 + rnd() * 9, c: [ORANGE, BLUE, CREAM][Math.floor(rnd() * 3)]
}));

const CX = 640, CY = 300, HOUSE_W = 290, TEXT_Y = 585;
// per-frame script (hand-tuned for few, clearly different frames)
const DOT_R   = [7, 22, 34, 18, 0];                  // frames 0..4
const BURST   = [0, 0, 0.28, 0.6, 0.88, 1.0];        // confetti travel, frames 0..5
const BURST_A = [0, 0, 1, 0.9, 0.5, 0.18];           // confetti opacity
const HOUSE_S = [0, 0, 0, 0.8, 0.92, 1.05];          // house scale, frames 0..5 (then 1)
const HOUSE_A = [0, 0, 0, 0.3, 0.7, 1];
const WORD_AT = [6, 7, 8];                           // frame where each word appears: "C&A", "Home", "Screen"
const DOTS_AT = [9, 10];                             // orange, blue

function frame(f) {
  const c = createCanvas(W, H), x = c.getContext('2d');
  x.fillStyle = BG; x.fillRect(0, 0, W, H);

  if (f < DOT_R.length && DOT_R[f] > 0) { x.fillStyle = CREAM; x.beginPath(); x.arc(CX, CY, DOT_R[f], 0, Math.PI * 2); x.fill(); }

  if (f < BURST.length && BURST_A[f] > 0) {
    for (const p of PARTS) {
      x.globalAlpha = BURST_A[f]; x.fillStyle = p.c;
      x.beginPath(); x.arc(CX + Math.cos(p.a) * p.d * BURST[f], CY + Math.sin(p.a) * p.d * BURST[f] * 0.78, p.r * (1 - 0.35 * BURST[f]), 0, Math.PI * 2); x.fill();
    }
    x.globalAlpha = 1;
  }

  const hs = f >= HOUSE_S.length ? 1 : HOUSE_S[f], ha = f >= HOUSE_A.length ? 1 : HOUSE_A[f];
  if (ha > 0) {
    const s = (HOUSE_W / HOUSE.w) * hs;
    x.save(); x.globalAlpha = ha; x.translate(CX - (HOUSE.w * s) / 2, CY - (HOUSE.h * s) / 2); x.scale(s, s);
    x.fillStyle = CREAM; x.fill(HOUSE.path); x.restore(); x.globalAlpha = 1;
  }

  // name, word by word
  x.font = '600 60px "Segoe UI"'; x.textBaseline = 'alphabetic';
  const TRACK = 7, chars = [...NAME];
  const widths = chars.map((ch) => x.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + TRACK * (chars.length - 1);
  let px = CX - total / 2, word = 0;
  chars.forEach((ch, i) => {
    if (ch === ' ') word++;
    const age = f - WORD_AT[Math.min(word, 2)];
    if (age >= 0 && ch !== ' ') {
      x.globalAlpha = age === 0 ? 0.6 : 1; x.fillStyle = CREAM;
      x.fillText(ch, px, TEXT_Y + (age === 0 ? 12 : 0));
    }
    px += widths[i] + TRACK;
  });
  x.globalAlpha = 1;

  [[CX - 30, ORANGE, DOTS_AT[0]], [CX + 30, BLUE, DOTS_AT[1]]].forEach(([dx, col, at]) => {
    const age = f - at;
    if (age >= 0) { x.fillStyle = col; x.beginPath(); x.arc(dx, 692, age === 0 ? 15 : 12, 0, Math.PI * 2); x.fill(); }
  });
  return c;
}

const canv = Array.from({ length: N }, (_, f) => frame(f));
const frames = canv.map((c) => c.toBuffer('image/png'));
const finalCanvas = canv[N - 1], finalPng = frames[N - 1];
fs.writeFileSync(OUT + '/final-preview.png', finalPng);

{ // contact sheet
  const cols = 6, tw = 320, th = 200, sheet = createCanvas(cols * tw, Math.ceil(N / cols) * th), sx = sheet.getContext('2d');
  sx.fillStyle = '#000'; sx.fillRect(0, 0, sheet.width, sheet.height);
  canv.forEach((c, i) => sx.drawImage(c, (i % cols) * tw, Math.floor(i / cols) * th, tw, th));
  fs.writeFileSync(OUT + '/anim-sheet.png', sheet.toBuffer('image/png'));
}

{ // static boot logo (portrait 800x1280, rotated 90 degrees clockwise like the original, 24-bit BMP, same header)
  const p = createCanvas(800, 1280), px = p.getContext('2d');
  px.translate(800, 0); px.rotate(Math.PI / 2); px.drawImage(finalCanvas, 0, 0);
  const data = px.getImageData(0, 0, 800, 1280).data;
  const orig = fs.readFileSync(require('path').join(__dirname, 'bootlogo.bmp') /* your frame's original boot logo (backup it first) */);
  const bmp = Buffer.alloc(54 + 800 * 1280 * 3);
  orig.subarray(0, 54).copy(bmp, 0);
  for (let y = 0; y < 1280; y++) {
    const src = (1279 - y) * 800 * 4, dst = 54 + y * 800 * 3;
    for (let xx = 0; xx < 800; xx++) {
      bmp[dst + xx * 3] = data[src + xx * 4 + 2]; bmp[dst + xx * 3 + 1] = data[src + xx * 4 + 1]; bmp[dst + xx * 3 + 2] = data[src + xx * 4];
    }
  }
  fs.writeFileSync(OUT + '/bootlogo-new.bmp', bmp);
  console.log('bootlogo-new.bmp', bmp.length, 'octets (original', orig.length + ')');
}

{ // bootanimation.zip, stored
  const files = [{ name: 'desc.txt', data: Buffer.from(`${W} ${H} ${FPS}\np 1 0 part0\nc 0 0 part1\n`) }];
  for (let i = 0; i < N - 1; i++) files.push({ name: `part0/${String(i).padStart(3, '0')}.png`, data: frames[i] });
  files.push({ name: 'part1/000.png', data: finalPng });
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), crc = zlib.crc32(f.data), size = f.data.length;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(10, 4); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(size, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(10, 6); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(size, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + size;
  }
  const cd = Buffer.concat(central), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16);
  const zip = Buffer.concat([...parts, cd, eocd]);
  fs.writeFileSync(OUT + '/bootanimation-new.zip', zip);
  console.log('bootanimation-new.zip', zip.length, 'octets,', files.length, 'fichiers,', (N - 1) + ' images + boucle finale');
}

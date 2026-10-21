import fs from 'node:fs';

// our icon name -> Font Awesome Free (solid) icon name
const MAP = {
  home: 'house', calendar: 'calendar-days', tasks: 'square-check', cart: 'cart-shopping', photo: 'image', sliders: 'sliders',
  bulb: 'lightbulb', lock: 'lock', unlock: 'lock-open', garage: 'warehouse', blinds: 'bars', thermo: 'temperature-half',
  camera: 'camera', music: 'music', plus: 'plus', minus: 'minus', left: 'chevron-left', right: 'chevron-right', x: 'xmark',
  check: 'check', heart: 'heart', star: 'star', pin: 'location-dot', car: 'car', drop: 'droplet', box: 'robot', door: 'door-open',
  bell: 'bell', mic: 'microphone', play: 'play', pause: 'pause', undo: 'rotate-left', clock: 'clock', person: 'user', bolt: 'bolt',
  film: 'film', utensils: 'utensils', sunrise: 'sun', away: 'right-from-bracket',
  sun: 'sun', cloud: 'cloud', rain: 'cloud-rain', partly: 'cloud-sun', moon: 'moon',
  shirt: 'shirt', coffee: 'mug-hot', warn: 'triangle-exclamation', fire: 'fire', snow: 'snowflake', fan: 'wind', power: 'power-off', backward: 'backward-step', forward: 'forward-step'
};

const VERSION = '6.7.2';
const base = `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@${VERSION}/svgs/solid/`;
const need = [...new Set(Object.values(MAP))];
const svgs = {};
await Promise.all(need.map(async (n) => {
  const r = await fetch(base + n + '.svg');
  if (!r.ok) throw new Error('404 ' + n);
  const t = await r.text();
  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(t);
  const d = /<path d="([^"]+)"/.exec(t);
  if (!vb || !d) throw new Error('parse ' + n);
  svgs[n] = { w: +vb[1], h: +vb[2], d: d[1] };
}));

let out = `// Icons: Font Awesome Free ${VERSION} (solid), https://fontawesome.com : icons CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
// Usage: App.icon('home', 28)  (see app.js). Names on the left are the dashboard's own; they map to the Font Awesome icon in the comment.
window.ICONS = {
`;
const keys = Object.keys(MAP);
keys.forEach((k, i) => {
  const s = svgs[MAP[k]];
  out += `  ${k}: { w: ${s.w}, h: ${s.h}, d: '${s.d}' }${i < keys.length - 1 ? ',' : ''} // ${MAP[k]}\n`;
});
out += '};\n';
fs.writeFileSync(process.argv[2], out);
console.log('icônes uniques:', need.length, '| taille icons.js:', out.length, 'octets');

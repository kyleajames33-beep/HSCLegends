// Generate solid-colour PWA icons (valid PNGs) without external deps.
// Produces public/icon-192.png and public/icon-512.png for installability.
import fs from 'node:fs';
import zlib from 'node:zlib';

const COLOR = [79, 70, 229, 255]; // indigo-600 RGBA

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  // raw scanlines: each row prefixed with filter byte 0
  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) {
    row[1 + x * 4] = COLOR[0];
    row[2 + x * 4] = COLOR[1];
    row[3 + x * 4] = COLOR[2];
    row[4 + x * 4] = COLOR[3];
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/icon-192.png', png(192));
fs.writeFileSync('public/icon-512.png', png(512));
console.log('wrote public/icon-192.png, public/icon-512.png');

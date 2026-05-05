/**
 * CacheMux — Icon Generator (no dependencies)
 * Creates minimal PNG icons using raw binary data.
 * Run: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

function createPNG(width, height, drawFunc) {
  // Create RGBA pixel buffer
  const pixels = Buffer.alloc(width * height * 4, 0);

  function setPixel(x, y, r, g, b, a) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    x = Math.floor(x);
    y = Math.floor(y);
    const idx = (y * width + x) * 4;
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = a;
  }

  function fillRect(x1, y1, w, h, r, g, b) {
    for (let y = y1; y < y1 + h; y++)
      for (let x = x1; x < x1 + w; x++)
        setPixel(x, y, r, g, b, 255);
  }

  function drawCircle(cx, cy, radius, r, g, b, thick) {
    for (let a = 0; a < 360; a += 0.5) {
      const rad = (a * Math.PI) / 180;
      for (let t = -thick / 2; t <= thick / 2; t += 0.5) {
        const x = cx + (radius + t) * Math.cos(rad);
        const y = cy + (radius + t) * Math.sin(rad);
        setPixel(Math.round(x), Math.round(y), r, g, b, 255);
      }
    }
  }

  function drawHexagon(cx, cy, radius, r, g, b, thick) {
    for (let i = 0; i < 6; i++) {
      const a1 = (Math.PI / 3) * i - Math.PI / 2;
      const a2 = (Math.PI / 3) * ((i + 1) % 6) - Math.PI / 2;
      const x1 = cx + radius * Math.cos(a1);
      const y1 = cy + radius * Math.sin(a1);
      const x2 = cx + radius * Math.cos(a2);
      const y2 = cy + radius * Math.sin(a2);
      drawLine(x1, y1, x2, y2, r, g, b, thick);
    }
  }

  function drawLine(x1, y1, x2, y2, r, g, b, thick) {
    const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const steps = Math.max(dist * 2, 1);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      for (let tx = -thick / 2; tx <= thick / 2; tx += 0.5) {
        for (let ty = -thick / 2; ty <= thick / 2; ty += 0.5) {
          setPixel(Math.round(px + tx), Math.round(py + ty), r, g, b, 255);
        }
      }
    }
  }

  // Fill background
  fillRect(0, 0, width, height, 10, 10, 10);

  drawFunc({ setPixel, fillRect, drawCircle, drawHexagon, drawLine, width, height });

  // Build PNG
  // Raw data with filter byte (0 = None) per row
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);

  const typeB = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeB, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData) >>> 0);

  return Buffer.concat([len, typeB, data, crc]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return c ^ 0xffffffff;
}

// Draw function
function drawIcon(ctx) {
  const { width: w, height: h, drawHexagon, fillRect, drawCircle } = ctx;
  const cx = w / 2;
  const cy = h / 2;
  const r = w * 0.35;
  const thick = Math.max(1, w / 16);

  // Hexagon outline
  drawHexagon(cx, cy, r, 255, 255, 255, thick);

  if (w >= 32) {
    // Lock body
    const lockW = Math.max(3, Math.floor(w * 0.18));
    const lockH = Math.max(2, Math.floor(w * 0.14));
    const lockX = Math.floor(cx - lockW / 2);
    const lockY = Math.floor(cy);
    fillRect(lockX, lockY, lockW, lockH, 255, 255, 255);

    // Lock shackle (half circle)
    const shR = lockW * 0.4;
    for (let a = 180; a <= 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      for (let t = -thick / 2; t <= thick / 2; t += 0.5) {
        const px = cx + (shR + t) * Math.cos(rad);
        const py = lockY + (shR + t) * Math.sin(rad);
        ctx.setPixel(Math.round(px), Math.round(py), 255, 255, 255, 255);
      }
    }
  }
}

// Generate icons
[16, 48, 128].forEach(size => {
  const png = createPNG(size, size, drawIcon);
  const filePath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filePath, png);
  console.log(`Created: icon${size}.png (${png.length} bytes)`);
});

console.log('Done!');

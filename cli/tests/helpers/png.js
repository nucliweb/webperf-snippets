import { crc32, deflateSync } from "node:zlib";

// Grayscale PNGs built byte by byte, so a test controls both the natural size and the encoded
// size of an image, which is what its bits per pixel depend on. The same arguments always give
// the same bytes.

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encode(width, height, bitDepth, rows) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = bitDepth;
  header[9] = 0; // grayscale
  // Bytes 10 to 12: deflate, adaptive filtering, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// One flat color: a large image in very few bytes
export function flatPng(width, height) {
  const rowBytes = 1 + Math.ceil(width / 8);
  return encode(width, height, 1, Buffer.alloc(rowBytes * height));
}

// Pseudo-random gray levels, which deflate cannot shrink: about one byte per pixel
export function noisePng(width, height, seed = 1) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state >>> 24;
  };
  const rows = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) rows[y * (width + 1) + 1 + x] = next();
  }
  return encode(width, height, 8, rows);
}

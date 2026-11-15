import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const sourcePath = fileURLToPath(new URL('./entry.png', import.meta.url));
const source = readFileSync(sourcePath);
const maxBytes = 1_048_576;

if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) {
  throw new Error('entry.png must begin with the JPEG start marker (FF D8).');
}
if (source[source.length - 2] !== 0xff || source[source.length - 1] !== 0xd9) {
  throw new Error('entry.png must end with the JPEG end marker (FF D9).');
}
if (source.length > maxBytes) {
  throw new Error(`entry.png is ${source.length} bytes; the limit is ${maxBytes}.`);
}

const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
let width: number | undefined;
let height: number | undefined;
let offset = 2;

while (offset < source.length - 2) {
  if (source[offset] !== 0xff) throw new Error('entry.png has an invalid JPEG marker sequence.');
  while (source[offset] === 0xff) offset++;
  const marker = source[offset++];
  if (marker === 0xda || marker === 0xd9) break;
  if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
  if (offset + 2 > source.length) throw new Error('entry.png has a truncated JPEG segment.');

  const segmentLength = source.readUInt16BE(offset);
  if (segmentLength < 2 || offset + segmentLength > source.length) {
    throw new Error('entry.png has an invalid or truncated JPEG segment.');
  }
  if (frameMarkers.has(marker)) {
    if (segmentLength < 7) throw new Error('entry.png has a truncated JPEG frame header.');
    height = source.readUInt16BE(offset + 3);
    width = source.readUInt16BE(offset + 5);
    break;
  }
  offset += segmentLength;
}

if (width === undefined || height === undefined || width === 0 || height === 0) {
  throw new Error('entry.png does not contain a readable JPEG frame size.');
}
if (width > 1024 || height > 1024) {
  throw new Error(`entry.png dimensions ${width}x${height} exceed the 1024x1024 limit.`);
}

const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR || '/output';
mkdirSync(outputDirectory, { recursive: true });
const outputPath = join(outputDirectory, 'entry.png');
copyFileSync(sourcePath, outputPath);
const copied = readFileSync(outputPath);
if (!source.equals(copied)) throw new Error('The output image differs from entry.png.');

console.log(`Wrote ${copied.length} bytes (${width}x${height}) to ${outputPath}.`);

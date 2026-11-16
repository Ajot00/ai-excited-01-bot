import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const imagePath = fileURLToPath(new URL('./entry.png', import.meta.url));
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const outputPath = join(outputDirectory, 'entry.png');
const image = readFileSync(imagePath);

function dimensionsOfJpeg(data: Buffer): { width: number; height: number } {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) {
    throw new Error('entry.png is missing the JPEG start marker FF D8.');
  }
  if (data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
    throw new Error('entry.png is missing the JPEG end marker FF D9.');
  }

  const frameTypes = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset < data.length - 2) {
    if (data[offset] !== 0xff) throw new Error('JPEG header has an invalid marker boundary.');
    while (offset < data.length && data[offset] === 0xff) offset++;
    if (offset >= data.length) break;
    const marker = data[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > data.length) throw new Error('JPEG header ends inside a segment length.');

    const segmentSize = data.readUInt16BE(offset);
    if (segmentSize < 2 || offset + segmentSize > data.length) {
      throw new Error('JPEG header contains a truncated segment.');
    }
    if (frameTypes.has(marker)) {
      if (segmentSize < 7) throw new Error('JPEG frame header is too short to contain dimensions.');
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) };
    }
    offset += segmentSize;
  }
  throw new Error('JPEG frame dimensions could not be found.');
}

if (image.length > 1_048_576) throw new Error(`Image is ${image.length} bytes; maximum allowed is 1048576.`);
const { width, height } = dimensionsOfJpeg(image);
if (width === 0 || height === 0) throw new Error(`Image dimensions must be positive; found ${width}x${height}.`);
if (width > 1024 || height > 1024) {
  throw new Error(`Image dimensions are ${width}x${height}; maximum allowed is 1024x1024.`);
}

mkdirSync(outputDirectory, { recursive: true });
copyFileSync(imagePath, outputPath);
const written = readFileSync(outputPath);
if (!image.equals(written)) throw new Error('Copied entry.png does not match the source bytes.');
console.log(`Wrote ${written.length} bytes to ${outputPath}.`);

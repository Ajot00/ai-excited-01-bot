import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const imagePath = fileURLToPath(new URL('./entry.png', import.meta.url));
const image = readFileSync(imagePath);
const byteLimit = 1_048_576;

if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8) {
  throw new Error('The source image must start with the JPEG marker FF D8.');
}
if (image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) {
  throw new Error('The source image must end with the JPEG marker FF D9.');
}
if (image.length > byteLimit) {
  throw new Error(`The source image is ${image.length} bytes; maximum allowed is ${byteLimit}.`);
}

const frameTypes = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
let cursor = 2;
let dimensions: { width: number; height: number } | undefined;

while (cursor < image.length - 2) {
  if (image[cursor] !== 0xff) throw new Error('The JPEG header contains an invalid marker.');
  while (image[cursor] === 0xff) cursor++;
  if (cursor >= image.length) break;
  const marker = image[cursor++];

  if (marker === 0xda || marker === 0xd9) break;
  if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
  if (cursor + 2 > image.length) throw new Error('The JPEG header ends inside a segment length.');

  const length = image.readUInt16BE(cursor);
  if (length < 2 || cursor + length > image.length) {
    throw new Error('The JPEG header contains a truncated segment.');
  }

  if (frameTypes.has(marker)) {
    if (length < 7) throw new Error('The JPEG frame header is too short to contain dimensions.');
    dimensions = {
      height: image.readUInt16BE(cursor + 3),
      width: image.readUInt16BE(cursor + 5),
    };
    break;
  }
  cursor += length;
}

if (!dimensions) throw new Error('Could not find image dimensions in the JPEG frame header.');
if (dimensions.width < 1 || dimensions.height < 1) {
  throw new Error('The JPEG frame dimensions must be positive.');
}
if (dimensions.width > 1024 || dimensions.height > 1024) {
  throw new Error(`The JPEG is ${dimensions.width}x${dimensions.height}; maximum allowed is 1024x1024.`);
}

const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR || '/output';
const destination = join(outputDirectory, 'entry.png');
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, image);

const writtenImage = readFileSync(destination);
if (!image.equals(writtenImage)) throw new Error('The copied output differs from the source image.');
console.log(`Wrote ${writtenImage.length} bytes (${dimensions.width}x${dimensions.height}) to ${destination}`);

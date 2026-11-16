import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sourcePath = fileURLToPath(new URL('./entry.png', import.meta.url));
const outputDirectory = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const outputPath = join(outputDirectory, 'entry.png');
const image = readFileSync(sourcePath);

function jpegDimensions(bytes: Buffer): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error('entry.png must begin with the JPEG start marker (FF D8).');
  }
  if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
    throw new Error('entry.png must end with the JPEG end marker (FF D9).');
  }

  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let cursor = 2;
  while (cursor < bytes.length - 2) {
    if (bytes[cursor] !== 0xff) throw new Error('Malformed JPEG: expected a marker in the header.');
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) break;

    const marker = bytes[cursor++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) throw new Error('Malformed JPEG: truncated marker length.');

    const segmentLength = bytes.readUInt16BE(cursor);
    if (segmentLength < 2 || cursor + segmentLength > bytes.length) {
      throw new Error('Malformed JPEG: segment extends beyond the image data.');
    }
    if (frameMarkers.has(marker)) {
      if (segmentLength < 7) throw new Error('Malformed JPEG: frame header is too short.');
      return {
        height: bytes.readUInt16BE(cursor + 3),
        width: bytes.readUInt16BE(cursor + 5),
      };
    }
    cursor += segmentLength;
  }

  throw new Error('Could not find image dimensions in the JPEG frame header.');
}

if (image.length > 1_048_576) {
  throw new Error(`entry.png is ${image.length} bytes; the maximum allowed size is 1048576 bytes.`);
}

const { width, height } = jpegDimensions(image);
if (width < 1 || height < 1) throw new Error(`JPEG frame dimensions are invalid: ${width}x${height}.`);
if (width > 1024 || height > 1024) {
  throw new Error(`entry.png is ${width}x${height}; the maximum allowed dimensions are 1024x1024.`);
}

mkdirSync(dirname(outputPath), { recursive: true });
copyFileSync(sourcePath, outputPath);
const writtenImage = readFileSync(outputPath);
if (!image.equals(writtenImage)) {
  throw new Error('Output verification failed: the copied image differs from entry.png.');
}

console.log(`Wrote ${writtenImage.length} bytes to ${outputPath}.`);

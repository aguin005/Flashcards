// Renders the PNG app icons in public/icons from the logo design. Run: node scripts/make-icons.mjs
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'public', 'icons');
mkdirSync(out, { recursive: true });

const cards = `
  <rect x="14" y="20" width="30" height="22" rx="4" fill="#c6ceff"/>
  <rect x="20" y="14" width="30" height="22" rx="4" fill="#ffffff"/>
  <path d="M27 25h16M27 30h10" stroke="#4a49f0" stroke-width="3" stroke-linecap="round"/>`;

// Rounded tile with transparent corners, for "any" purpose icons.
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4a49f0"/>${cards}</svg>`;
// Full-bleed square with the artwork inside the central safe zone, for maskable and Apple icons.
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#4a49f0"/><g transform="translate(9.6 9.6) scale(0.7)">${cards}</g></svg>`;

const icons = [
  ['icon-192.png', rounded, 192],
  ['icon-512.png', rounded, 512],
  ['icon-maskable-512.png', fullBleed, 512],
  ['apple-touch-icon.png', fullBleed, 180],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, svg, size] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: join(out, name), omitBackground: true });
}
await browser.close();
console.log('icons written to', out);

// Creates tests/fixtures/scanned-text.pdf: a PDF whose page is only an image of
// text (like a scan), used to test the optional OCR path. Requires Playwright.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const out = join(dirname(dirname(fileURLToPath(import.meta.url))), 'tests', 'fixtures', 'scanned-text.pdf');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1275, height: 1650 } });
await page.setContent(`<body style="margin:0;background:#fff;font:34px Georgia,serif;color:#111;padding:150px">
  <p style="font-weight:bold;font-size:44px">Chemistry Terms</p>
  <p>Atom: The smallest unit of a chemical element.</p>
  <p>Molecule: Two or more atoms bonded together.</p>
  <p>Isotope: Atoms of one element with different numbers of neutrons.</p>
  </body>`);
const png = await page.screenshot({ type: 'png' });
await browser.close();

const doc = await PDFDocument.create();
const img = await doc.embedPng(png);
const pdfPage = doc.addPage([612, 792]);
pdfPage.drawImage(img, { x: 0, y: 0, width: 612, height: 792 });
writeFileSync(out, await doc.save());
console.log('wrote', out);

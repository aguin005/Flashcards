// Generates the PDF fixtures used by the end-to-end tests (tests/fixtures).
// Run with: node scripts/make-fixtures.mjs
// The password-protected fixture is produced separately with Python's pypdf
// (see scripts/encrypt-fixture.py); the generated files are committed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const dir = join(dirname(dirname(fileURLToPath(import.meta.url))), 'tests', 'fixtures');
mkdirSync(dir, { recursive: true });

async function vocabNotes() {
  const doc = await PDFDocument.create();
  doc.setTitle('BIO 101 Unit 3 Study Guide');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const size = 11;

  const addPage = (n) => {
    const page = doc.addPage([612, 792]);
    page.drawText('BIO 101 - Unit 3 Study Guide', { x: 72, y: 760, size: 9, font });
    page.drawText(`Page ${n} of 3`, { x: 280, y: 36, size: 9, font });
    return page;
  };
  const writer = (page, startY) => {
    let y = startY;
    return {
      line(text, { x = 72, f = font, s = size, gap = 15 } = {}) {
        page.drawText(text, { x, y, size: s, font: f });
        y -= gap;
      },
      cells(left, right, { gap = 15 } = {}) {
        page.drawText(left, { x: 72, y, size, font: bold });
        page.drawText(right, { x: 220, y, size, font });
        y -= gap;
      },
      space(n) {
        y -= n;
      },
    };
  };

  // Page 1: delimiter formats, a wrapped definition, an example line, and a duplicate.
  let w = writer(addPage(1), 712);
  w.line('Cell Biology Vocabulary', { f: bold, s: 18, gap: 30 });
  w.line('Photosynthesis: The process by which plants use sunlight, water, and carbon dioxide to make');
  w.line('glucose and oxygen.');
  w.line('• Osmosis - The diffusion of water across a selectively permeable membrane.');
  w.line('• Diffusion – The movement of particles from high concentration to low concentration.');
  w.line('Mitochondria — The organelle that releases energy from food through cellular respiration.');
  w.line('Example: Muscle cells contain many mitochondria.');
  w.line('Ribosome: The site of protein synthesis in the cell.');
  w.line('Osmosis - The diffusion of water across a selectively permeable membrane.');

  // Page 2: a two-column table with a wrapped cell, then a definitional sentence.
  w = writer(addPage(2), 712);
  w.line('Genetics Table', { f: bold, s: 14, gap: 24 });
  w.cells('Term', 'Definition');
  w.cells('Allele', 'A different form of the same gene.');
  w.cells('Genotype', 'The genetic makeup of an organism, including');
  w.line('both dominant and recessive alleles.', { x: 220 });
  w.cells('Phenotype', 'The observable traits of an organism.');
  w.space(20);
  w.line('Natural selection refers to the process by which organisms better adapted to their');
  w.line('environment survive and reproduce more often.');

  // Page 3: a glossary section and a term list without definitions.
  w = writer(addPage(3), 712);
  w.line('Glossary', { f: bold, s: 14, gap: 24 });
  w.line('Homeostasis', { f: bold });
  w.line('The maintenance of stable internal conditions in an organism.');
  w.line('Enzyme', { f: bold });
  w.line('A protein that speeds up chemical reactions in living things.');
  w.space(12);
  w.line('Key terms: cytoplasm, vacuole');
  w.space(12);
  w.line('The cytoplasm is a jelly-like substance that fills the cell.');

  return doc.save();
}

async function imageOnly() {
  // No text operators at all: simulates a scanned page.
  const doc = await PDFDocument.create();
  for (let p = 0; p < 2; p++) {
    const page = doc.addPage([612, 792]);
    for (let i = 0; i < 20; i++) {
      page.drawRectangle({ x: 72, y: 700 - i * 30, width: 300 + ((i * 37) % 160), height: 8, color: rgb(0.2, 0.2, 0.2) });
    }
  }
  return doc.save();
}

async function noVocabulary() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const text = [
    'Meeting reminder for Thursday afternoon in the library.',
    'Please bring your laptop and the printed handout from last week.',
    'We will go over the schedule for the rest of the semester together.',
  ];
  text.forEach((t, i) => page.drawText(t, { x: 72, y: 700 - i * 16, size: 11, font }));
  return doc.save();
}

const corrupted = Buffer.concat([
  Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R'),
  Buffer.from(Array.from({ length: 400 }, (_, i) => (i * 7919) % 251)),
]);

writeFileSync(join(dir, 'vocab-notes.pdf'), await vocabNotes());
writeFileSync(join(dir, 'scanned-image-only.pdf'), await imageOnly());
writeFileSync(join(dir, 'no-vocabulary.pdf'), await noVocabulary());
writeFileSync(join(dir, 'corrupted.pdf'), corrupted);
writeFileSync(join(dir, 'not-really-a.pdf'), 'These are plain text notes saved with a .pdf extension.\n');
writeFileSync(join(dir, 'empty.pdf'), '');
console.log('fixtures written to', dir);

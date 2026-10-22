import { describe, expect, it } from 'vitest';
import { gradeAnswer, keywordSimilarity, normalizeAnswer } from '../../src/lib/grading';

describe('written answer grading', () => {
  it('normalizes case, whitespace, punctuation, and leading articles', () => {
    expect(normalizeAnswer('  The  Mitochondria!! ')).toBe('mitochondria');
    expect(normalizeAnswer('Café-au-lait')).toBe('cafe au lait');
  });

  it('accepts exact matches regardless of formatting', () => {
    expect(gradeAnswer('photosynthesis', 'Photosynthesis', { kind: 'term' }).verdict).toBe('correct');
    expect(gradeAnswer('  PHOTOSYNTHESIS. ', 'Photosynthesis', { kind: 'term' }).verdict).toBe('correct');
  });

  it('accepts stored alternates and listed variants', () => {
    expect(gradeAnswer('DNA', 'Deoxyribonucleic acid', { kind: 'term', alternates: ['DNA'] }).verdict).toBe('correct');
    expect(gradeAnswer('mitochondrion', 'Mitochondrion (pl. mitochondria)', { kind: 'term' }).verdict).toBe('correct');
    expect(gradeAnswer('soma', 'Cell body / soma', { kind: 'term' }).verdict).toBe('correct');
  });

  it('flags small typos as close instead of auto-accepting', () => {
    expect(gradeAnswer('photosynthesys', 'Photosynthesis', { kind: 'term' }).verdict).toBe('close');
    expect(gradeAnswer('osmosis', 'Diffusion', { kind: 'term' }).verdict).toBe('incorrect');
    expect(gradeAnswer('', 'Diffusion', { kind: 'term' }).verdict).toBe('incorrect');
  });

  it('grades definitions by key word overlap', () => {
    const def = 'The movement of water across a semipermeable membrane';
    expect(gradeAnswer('movement of water across a semipermeable membrane', def, { kind: 'definition' }).verdict).toBe(
      'correct',
    );
    expect(gradeAnswer('water moving across a membrane', def, { kind: 'definition' }).verdict).toBe('close');
    expect(gradeAnswer('a type of cell division', def, { kind: 'definition' }).verdict).toBe('incorrect');
    expect(keywordSimilarity('', def)).toBe(0);
  });

  it('does not split definitions on "or"', () => {
    const def = 'A cell or tissue that stores energy';
    expect(gradeAnswer('a cell', def, { kind: 'definition' }).verdict).not.toBe('correct');
  });
});

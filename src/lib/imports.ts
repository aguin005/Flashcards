import type { PdfImport, StoredFile } from '../types';
import { db } from './db';

/** PDF import drafts and stored PDF files (IndexedDB "imports" and "files" stores). */

export async function listImports(): Promise<PdfImport[]> {
  const all = await db.getAll('imports');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getImport = (id: string) => db.get('imports', id);

export async function saveImport(record: PdfImport): Promise<PdfImport> {
  const updated = { ...record, updatedAt: Date.now() };
  await db.put('imports', updated);
  return updated;
}

export async function deleteImport(id: string): Promise<void> {
  await db.delete('imports', id);
  await db.delete('files', id);
}

export async function saveFile(id: string, file: File): Promise<void> {
  const record: StoredFile = {
    id,
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    blob: file,
    createdAt: Date.now(),
  };
  await db.put('files', record);
}

export const getFile = (id: string) => db.get('files', id);

export async function listFiles(): Promise<Omit<StoredFile, 'blob'>[]> {
  const all = await db.getAll('files');
  return all.map(({ blob: _blob, ...meta }) => meta).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteFile(id: string): Promise<void> {
  await db.delete('files', id);
  const record = await db.get('imports', id);
  if (record) await db.put('imports', { ...record, hasFile: false });
}

/** Open a stored PDF in a new tab, optionally at a page (supported by most built-in PDF viewers). */
export async function openStoredPdf(id: string, page?: number): Promise<boolean> {
  const file = await getFile(id);
  if (!file) return false;
  const url = URL.createObjectURL(file.blob);
  window.open(page ? `${url}#page=${page}` : url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

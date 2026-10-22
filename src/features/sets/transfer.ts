import type { CardProgress, StudySet } from '../../types';
import { buildSetsExport, setToCsv } from '../../lib/export';
import { downloadFile, safeFileName } from '../../lib/utils';

/** Pick a local file with a temporary <input type="file">. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function exportSetJson(set: StudySet, progress: CardProgress[]) {
  const data = buildSetsExport([set], progress);
  downloadFile(`${safeFileName(set.title)}.json`, JSON.stringify(data, null, 2), 'application/json');
}

export function exportSetCsv(set: StudySet) {
  downloadFile(`${safeFileName(set.title)}.csv`, setToCsv(set), 'text/csv;charset=utf-8');
}

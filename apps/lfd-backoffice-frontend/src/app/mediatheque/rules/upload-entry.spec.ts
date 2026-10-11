import { describe, expect, it } from 'vitest';

import { isRetriable, retried, waitingEntry, type UploadEntry } from './upload-entry';

const file = new File(['octets'], 'a.png', { type: 'image/png' });

function refused(by: UploadEntry['refusedBy']): UploadEntry {
  return { ...waitingEntry(file), state: 'refused', reason: 'non', refusedBy: by };
}

describe('un fichier du lot', () => {
  it('entre en file sans rien porter', () => {
    expect(waitingEntry(file)).toEqual({
      file,
      name: 'a.png',
      state: 'waiting',
      reason: null,
      refusedBy: null,
      seriesId: null,
    });
  });

  it('ne se réessaie que s’il a été refusé par le serveur', () => {
    expect(isRetriable(refused('server'))).toBe(true);
    expect(isRetriable(refused('device'))).toBe(false);
    expect(isRetriable(waitingEntry(file))).toBe(false);
  });

  it('repart en file, refus effacé ; un refus du poste reste un refus', () => {
    expect(retried(refused('server'))).toMatchObject({
      state: 'waiting',
      reason: null,
      refusedBy: null,
    });
    const local = refused('device');
    expect(retried(local)).toBe(local);
  });
});

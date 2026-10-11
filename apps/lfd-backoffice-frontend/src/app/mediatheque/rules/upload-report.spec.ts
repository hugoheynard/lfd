import { describe, expect, it } from 'vitest';

import type { UploadEntry } from './upload-entry';
import { STATE_BADGES, alreadyNote } from './upload-report';

function entry(seriesId: string | null): UploadEntry {
  return {
    file: new File([new Uint8Array(1)], 'a.png', { type: 'image/png' }),
    name: 'a.png',
    state: 'already_in_library',
    reason: null,
    refusedBy: null,
    seriesId,
  };
}

const titles = (id: string): string | null => (id === 's0' ? 'Atelier' : null);

describe('le compte rendu — déjà au fonds', () => {
  it('nomme la série d’origine qu’elle garde', () => {
    expect(alreadyNote(entry('s0'), 's1', titles)).toBe(
      'Elle garde sa série d’origine, « Atelier ».',
    );
  });

  it('dit simplement qu’elle y est déjà quand c’est la même série', () => {
    expect(alreadyNote(entry('s1'), 's1', titles)).toBe('Elle est déjà dans cette série.');
  });

  it('dit qu’une image sans série n’en reçoit pas', () => {
    expect(alreadyNote(entry(null), 's1', titles)).toBe(
      'Elle n’a pas de série et n’en reçoit pas : un redépôt ne la change pas.',
    );
    expect(alreadyNote(entry(null), null, titles)).toBe('Rien n’a changé.');
  });

  it('ne crie pas quand la série d’origine n’est pas dans la liste', () => {
    expect(alreadyNote(entry('inconnue'), 's1', titles)).toBe('Elle garde sa série d’origine.');
  });
});

describe('le compte rendu — les pastilles', () => {
  it('dit chaque état, et ne fait une alerte que d’un refus', () => {
    expect(STATE_BADGES.refused).toEqual({ label: 'Refusé', variant: 'alert' });
    expect(STATE_BADGES.already_in_library.variant).toBe('info');
  });
});

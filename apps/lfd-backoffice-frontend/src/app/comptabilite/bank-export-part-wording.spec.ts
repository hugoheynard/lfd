import { describe, expect, it } from 'vitest';

import { exportPartSentence } from './bank-export-part-wording';

const ACCOUNTS = ['compte', 'comptes'] as const;

describe('le découpage d’un export en fichiers, en clair', () => {
  it('le premier de deux fichiers annonce les suivants', () => {
    expect(
      exportPartSentence({ reference: 'EXC-12', part: { rank: 1, count: 2 } }, 200, 37, ACCOUNTS),
    ).toBe(
      'EXC-12 · Fichier 1 sur 2 — 200 comptes. Les 37 suivants partiront dans le fichier 2, une fois celui-ci déposé dans CENET.',
    );
  });

  it('le dernier fichier ne dit que lui', () => {
    expect(
      exportPartSentence({ reference: 'EXC-13', part: { rank: 2, count: 2 } }, 37, 0, ACCOUNTS),
    ).toBe('EXC-13 · Fichier 2 sur 2 — 37 comptes.');
  });

  it('un seul en attente : au singulier', () => {
    expect(
      exportPartSentence({ reference: 'EXM-4', part: { rank: 1, count: 2 } }, 200, 1, [
        'mandat',
        'mandats',
      ]),
    ).toContain('Le suivant partira dans le fichier 2');
  });

  it('un export d’avant la numérotation : son numéro et son compte', () => {
    expect(exportPartSentence({ reference: 'EXC-1', part: null }, 1, 0, ACCOUNTS)).toBe(
      'EXC-1 — 1 compte.',
    );
  });
});

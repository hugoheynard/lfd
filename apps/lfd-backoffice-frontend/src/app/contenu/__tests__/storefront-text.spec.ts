import { describe, expect, it } from 'vitest';

import {
  emptyInfo,
  infoActionOf,
  infoIssues,
  optionalText,
  TEXT_LIMITS,
  textIn,
  writeText,
} from '../storefront-text';

describe('un texte de vitrine', () => {
  it('écrit une langue sans toucher aux autres ; vider une traduction la retire', () => {
    const fr = writeText(null, 'fr', 'Pâques');
    const both = writeText(fr, 'en', 'Easter');
    expect(both).toEqual({ fr: 'Pâques', en: 'Easter' });
    expect(writeText(both, 'it', 'Pasqua')).toEqual({ fr: 'Pâques', en: 'Easter', it: 'Pasqua' });
    expect(writeText(both, 'en', '')).toEqual({ fr: 'Pâques' });
    expect(textIn(both, 'it')).toBe('');
  });

  it('un texte facultatif sans aucune langue n’existe pas', () => {
    expect(optionalText({ fr: '' })).toBeNull();
    expect(optionalText({ fr: '', en: 'Hi' })).toEqual({ fr: '', en: 'Hi' });
  });
});

describe('ce qui empêcherait d’envoyer une info', () => {
  it('une info neuve n’a pas de titre : c’est dit', () => {
    expect(infoIssues(emptyInfo())).toEqual(['Le titre en français est obligatoire.']);
  });

  it('un texte trop long, dans n’importe quelle langue', () => {
    const info = {
      ...emptyInfo(),
      title: { fr: 'Pâques', en: 'x'.repeat(TEXT_LIMITS.title.max + 1) },
    };
    expect(infoIssues(info)).toEqual(['Le titre tient en 80 caractères, dans chaque langue.']);
  });

  it('une traduction sans son français, sur un texte facultatif', () => {
    const info = { ...emptyInfo(), title: { fr: 'Noël' }, badge: { fr: '', en: 'New' } };
    expect(infoIssues(info)).toEqual([
      'La pastille a une traduction : écrivez aussi son français.',
    ]);
  });

  it('une info complète ne dit rien', () => {
    const info = {
      ...emptyInfo(),
      title: { fr: 'Noël' },
      image: { url: 'https://cdn.example/noel.jpg', alt: null },
    };
    expect(infoIssues(info)).toEqual([]);
  });

  describe('liée à une opération (D11)', () => {
    const linked = { ...emptyInfo(), operationKey: 'noel-2026', action: 'operation' as const };

    it('un titre vide hérite du nom de l’opération : rien à dire', () => {
      expect(infoIssues(linked)).toEqual([]);
    });

    it('une traduction du titre sans son français reste refusée — l’héritage est tout ou rien', () => {
      expect(infoIssues({ ...linked, title: { fr: '', en: 'Christmas' } })).toEqual([
        'Le titre a une traduction : écrivez aussi son français.',
      ]);
    });

    it('une action sans sa cible le dit', () => {
      expect(infoIssues({ ...linked, operationKey: null })).toEqual([
        'Le titre en français est obligatoire.',
        'Choisissez l’opération qu’ouvre l’annonce, ou changez l’action.',
      ]);
      expect(infoIssues({ ...emptyInfo(), title: { fr: 'Noël' }, action: 'shelf' })).toEqual([
        'Choisissez le rayon qu’ouvre l’annonce, ou changez l’action.',
      ]);
    });
  });

  it('l’action se déduit des cibles quand elle n’est pas dite', () => {
    const { action: _omitted, ...bare } = emptyInfo();
    expect(infoActionOf(bare)).toBe('none');
    expect(infoActionOf({ ...bare, linkShelfKey: 'bread' })).toBe('shelf');
    expect(infoActionOf({ ...bare, operationKey: 'noel-2026' })).toBe('operation');
  });
});

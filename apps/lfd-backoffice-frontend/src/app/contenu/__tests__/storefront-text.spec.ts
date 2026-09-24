import { describe, expect, it } from 'vitest';

import {
  emptyInfo,
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
});

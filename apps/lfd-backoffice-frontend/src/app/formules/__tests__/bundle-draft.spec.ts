import { describe, expect, it } from 'vitest';

import {
  choiceMoved,
  compositionPayload,
  compositionProblem,
  groupsOf,
  newGroup,
  renamed,
  sameComposition,
  standingReason,
  swapped,
  withChoice,
  withoutChoice,
  withoutGroup,
} from '../bundle-draft';
import { bundleChoice, bundleView } from '../bundle.testing';

describe('le brouillon de composition', () => {
  const saved = groupsOf(bundleView());

  it('ne voit aucun changement sur la composition lue', () => {
    expect(sameComposition(groupsOf(bundleView()), saved)).toBe(true);
  });

  it('voit un renommage, un réordonnancement, un retrait', () => {
    expect(sameComposition(renamed(saved, 'boisson', 'Boissons'), saved)).toBe(false);
    expect(sameComposition(swapped(saved, 0, 1), saved)).toBe(false);
    expect(sameComposition(withoutGroup(saved, 'boisson'), saved)).toBe(false);
  });

  it('garde la clé d’un groupe renommé, et envoie null pour un groupe neuf', () => {
    const groups = [...renamed(saved, 'boisson', ' Boissons '), newGroup('Dessert')];
    expect(compositionPayload(groups).groups).toEqual([
      { key: 'boisson', label: 'Boissons', choices: ['CAFE-1'] },
      { key: 'viennoiserie', label: 'Viennoiserie', choices: ['CROI-1'] },
      { key: null, label: 'Dessert', choices: [] },
    ]);
  });

  it('ajoute un article en fin de groupe, sans le doubler', () => {
    const the = bundleChoice({ sku: 'THE-1', name: 'Thé' });
    const once = withChoice(saved, 'boisson', the);
    expect(once[0]?.choices.map((c) => c.sku)).toEqual(['CAFE-1', 'THE-1']);
    expect(withChoice(once, 'boisson', the)).toEqual(once);
  });

  it('réordonne et retire un article dans son groupe seulement', () => {
    const two = withChoice(saved, 'boisson', bundleChoice({ sku: 'THE-1' }));
    expect(choiceMoved(two, 'boisson', 1, -1)[0]?.choices.map((c) => c.sku)).toEqual([
      'THE-1',
      'CAFE-1',
    ]);
    expect(withoutChoice(two, 'boisson', 'CAFE-1')[0]?.choices.map((c) => c.sku)).toEqual([
      'THE-1',
    ]);
    expect(swapped(two, 1, 1)).toBe(two);
  });

  it('dit ce qui manque avant l’envoi : deux groupes, un libellé, un article', () => {
    expect(compositionProblem([newGroup('Seul')])).toContain('au moins 2 groupes');
    expect(compositionProblem([...saved, newGroup('')])).toContain('libellé');
    expect(compositionProblem([...saved, newGroup('Dessert')])).toContain('au moins un article');
    expect(compositionProblem(saved)).toBeNull();
  });

  it('nomme la raison d’un article non admissible', () => {
    expect(standingReason('admissible')).toBeNull();
    expect(standingReason('not_served_to_public')).toBe('Plus servi au public');
    expect(standingReason('operation_only')).toBe('Réservé aux opérations');
    expect(standingReason('unknown')).toBe('Inconnu du catalogue');
  });
});

import type { IngredientAllergenPropagationView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import {
  allergenDiff,
  appliedProductCount,
  propagationMessage,
  publishedLoses,
} from '../allergen-propagation';
import { MILK_REMOVED } from './propagation-fixtures';

const LABELS: Record<string, string> = { UW: 'Blé', AM: 'Lait' };
const labelOf = (code: string): string => LABELS[code] ?? code;

const GLUTEN_ADDED: IngredientAllergenPropagationView = {
  ingredientKey: 'farine-t65',
  ingredientName: 'Farine T65',
  added: ['UW'],
  removed: [],
  products: [],
  counts: {
    productsTouched: 15,
    toLose: 0,
    toLosePublished: 0,
    toReceive: 5,
    toReceivePublished: 3,
    blocked: 0,
    undeclared: 1,
    alreadyDeclared: 9,
    keptByOtherIngredient: 0,
  },
};

describe('propagationMessage — le message chiffré du § 2', () => {
  it('dit l’ajout, le total et la partition', () => {
    expect(propagationMessage(GLUTEN_ADDED, labelOf)).toBe(
      "« Blé » ajouté à Farine T65 touche 15 fiches : 5 vont le recevoir (dont 3 publiées), 1 n'a pas encore de déclaration, 9 le déclarent déjà.",
    );
  });

  it('dit le retrait, les publiées qui perdraient et celles qu’un autre ingrédient garde', () => {
    expect(propagationMessage(MILK_REMOVED, labelOf)).toBe(
      '« Lait » retiré de Beurre doux touche 3 fiches : 2 pourraient le perdre (dont 1 publiée) ; 1 le garde, un autre ingrédient en contient.',
    );
  });

  it('nomme le code brut quand le référentiel ne le connaît pas', () => {
    expect(propagationMessage({ ...GLUTEN_ADDED, added: ['XX'] }, labelOf)).toContain('« XX »');
  });
});

describe('appliedProductCount — le N du bouton', () => {
  it('vaut à recevoir + à perdre quand toutes les cases sont cochées', () => {
    expect(appliedProductCount(MILK_REMOVED, new Set())).toBe(2);
  });

  it('décroît quand une case de retrait est décochée', () => {
    expect(appliedProductCount(MILK_REMOVED, new Set(['v1']))).toBe(1);
  });
});

describe('publishedLoses — le rouge', () => {
  const [croissant, brioche] = MILK_REMOVED.products;

  it('vise la fiche publiée qui perdrait un code', () => {
    expect(croissant && publishedLoses(croissant, new Set())).toBe(true);
    expect(brioche && publishedLoses(brioche, new Set())).toBe(false);
  });

  it('s’éteint quand son retrait est décoché', () => {
    expect(croissant && publishedLoses(croissant, new Set(['v1']))).toBe(false);
  });
});

describe('allergenDiff', () => {
  it('rend les codes ajoutés et retirés, sans tenir compte de l’ordre', () => {
    expect(allergenDiff(['AM', 'UW'], ['UW', 'SA'])).toEqual({ added: ['SA'], removed: ['AM'] });
  });
});

import {
  alterationSentence,
  buildAlteration,
  formatAlteration,
  fromCartAdjustment,
  toCartAdjustment,
} from '../price-alteration.model';

describe('construire une altération depuis la saisie', () => {
  it('convertit en entiers : 20 % → 2000 bp, 20 € → 2000 centimes', () => {
    expect(buildAlteration(20, 'percent', 'decrease')).toEqual({
      direction: 'decrease',
      mode: 'percent',
      bp: 2000,
    });
    expect(buildAlteration(20, 'amount', 'increase')).toEqual({
      direction: 'increase',
      mode: 'amount',
      cents: 2000,
    });
  });

  it('arrondit les centimes plutôt que de garder un flottant', () => {
    // 12,345 € n'existe pas ; laisser filer 1234.4999… en centimes finirait en
    // écart d'un centime sur une facture.
    expect(buildAlteration(12.345, 'amount', 'increase')).toEqual({
      direction: 'increase',
      mode: 'amount',
      cents: 1235,
    });
  });

  it('rend `null` pour un champ vide, zéro, ou une grandeur négative', () => {
    // Le signe se dit par le SENS. Un nombre négatif serait une deuxième façon
    // d'exprimer la même chose, qui finirait par contredire la première.
    expect(buildAlteration(null, 'percent', 'decrease')).toBeNull();
    expect(buildAlteration(0, 'percent', 'decrease')).toBeNull();
    expect(buildAlteration(-5, 'amount', 'increase')).toBeNull();
  });
});

describe('la phrase qui dit ce que ça fait', () => {
  it('nomme le sens, pas un signe', () => {
    expect(alterationSentence({ direction: 'decrease', mode: 'percent', bp: 2000 })).toBe(
      'Vous réduisez le prix de 20 %.',
    );
    expect(alterationSentence({ direction: 'increase', mode: 'amount', cents: 2000 })).toBe(
      'Vous augmentez le prix de 20,00 €.',
    );
  });

  it('dit explicitement qu’il ne se passe rien', () => {
    expect(alterationSentence(null)).toBe('Le prix reste inchangé.');
  });
});

describe('le format court', () => {
  it('écrit les euros avec deux décimales et une virgule', () => {
    expect(formatAlteration({ direction: 'increase', mode: 'amount', cents: 550 })).toBe('5,50 €');
    expect(formatAlteration({ direction: 'decrease', mode: 'percent', bp: 550 })).toBe('5.5 %');
  });
});

describe('l’aller-retour avec le CartAdjustment du contrat', () => {
  it('perd le sens à l’aller — c’est le but', () => {
    // Le contrat ne porte QUE la grandeur : son sens vient de l'emplacement
    // qui le lit. Deux altérations opposées y deviennent donc identiques.
    const remise = toCartAdjustment({ direction: 'decrease', mode: 'percent', bp: 2000 });
    const majoration = toCartAdjustment({ direction: 'increase', mode: 'percent', bp: 2000 });

    expect(remise).toEqual({ mode: 'percent', bp: 2000 });
    expect(remise).toEqual(majoration);
  });

  it('rend le sens au retour, depuis l’emplacement', () => {
    expect(fromCartAdjustment({ mode: 'amount', cents: 2000 }, 'increase')).toEqual({
      direction: 'increase',
      mode: 'amount',
      cents: 2000,
    });
  });

  it('laisse passer le rien dans les deux sens', () => {
    expect(toCartAdjustment(null)).toBeNull();
    expect(fromCartAdjustment(null, 'decrease')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { MILLICENTS_PER_CENT, magnitudeFromWire, magnitudeToWire } from '../pricing-format';

/**
 * **Régression : un montant part en MILLICENTIMES, un pourcentage en points de
 * base — et les deux facteurs ne sont pas le même.**
 *
 * Les trois panneaux de saisie appliquaient `× 100` aux deux. C'est juste pour
 * un pourcentage (5 % → 500 bp) et faux d'un facteur mille pour un montant : une
 * règle « −0,05 € » partait à `5` et retirait 0,00005 €, une limite « 2,18 € » se
 * posait à 0,00218 €. Silencieux, sur un écran en service, pendant des semaines.
 *
 * Ce qui a fait durer le défaut n'est pas le calcul mais un COMMENTAIRE : le
 * panneau de barème expliquait que « les deux unités du modèle sont des centièmes
 * de leur unité naturelle » et demandait qu'on ne le « corrige » pas en croyant à
 * un oubli. Il protégeait le bug qu'il décrivait.
 *
 * Ces cas fixent donc l'unité, pas l'arithmétique.
 */
describe('la grandeur envoyée au fil', () => {
  it('envoie un pourcentage en points de base', () => {
    expect(magnitudeToWire(5, 'percent')).toBe(500);
    expect(magnitudeToWire(12.5, 'percent')).toBe(1_250);
  });

  /** Le cas exact du bug : cinq centimes valent cinq mille millicentimes. */
  it('envoie un montant en millicentimes, pas en centimes', () => {
    expect(magnitudeToWire(0.05, 'amount')).toBe(5_000);
    expect(magnitudeToWire(2.18, 'amount')).toBe(218_000);
  });

  it('n’applique pas le même facteur aux deux unités', () => {
    expect(magnitudeToWire(1, 'amount')).toBe(magnitudeToWire(1, 'percent') * MILLICENTS_PER_CENT);
  });

  /**
   * Le retour doit rendre la valeur SAISIE, sinon rouvrir une limite de 2,00 €
   * affiche « 2000 » dans le champ — ce qu'elle faisait.
   */
  it('rend la valeur saisie quand on rouvre ce qui a été posé', () => {
    for (const value of [0.05, 2.18, 12.5]) {
      expect(magnitudeFromWire(magnitudeToWire(value, 'amount'), 'amount')).toBeCloseTo(value, 5);
      expect(magnitudeFromWire(magnitudeToWire(value, 'percent'), 'percent')).toBeCloseTo(value, 5);
    }
  });

  it('relit une limite de 2,00 € posée en base comme 2,00 et non 2000', () => {
    expect(magnitudeFromWire(200_000, 'amount')).toBe(2);
  });
});

import type { ElasticityComparison, ItemElasticityView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { liveEffort } from '../live-effort';

/**
 * **L'effort de vente d'un prix qu'on est en train de taper.**
 *
 * Ce que ces cas tiennent, c'est la frontière : ce qui se recalcule à la frappe
 * — le ratio, l'objectif, l'atteinte — et ce qui ne doit surtout PAS bouger —
 * les volumes mesurés et leurs fenêtres. Le jour où une mesure suivrait le prix
 * tapé, l'objectif serait toujours atteint et la colonne ne dirait plus rien.
 */

const CANONICAL = 200_000;

function comparison(baselineVolume: number, observedVolume: number): ElasticityComparison {
  return {
    baseline: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z', days: 30 },
    baselineVolume,
    observed: { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z', days: 30 },
    observedVolume,
    targetVolume: baselineVolume,
    attainmentBp: 10_000,
    conclusive: true,
  };
}

function measured(): ItemElasticityView {
  return {
    fromMillicents: CANONICAL,
    toMillicents: CANONICAL,
    isoRevenueRatioBp: 10_000,
    sinceChange: comparison(100, 90),
    rolling: comparison(100, 90),
  };
}

describe('ce qui suit le prix tapé', () => {
  it('traduit une remise de 20 % en ×1,25', () => {
    const live = liveEffort(measured(), CANONICAL, 160_000);

    expect(live?.isoRevenueRatioBp).toBe(12_500);
    expect(live?.toMillicents).toBe(160_000);
  });

  it('relève l’objectif, et l’atteinte avec lui', () => {
    // Cent pièces vendues au tarif, quatre-vingt-dix réalisées : à −20 %, il en
    // faut cent vingt-cinq, et les quatre-vingt-dix n'en font plus que 72 %.
    const live = liveEffort(measured(), CANONICAL, 160_000);

    expect(live?.rolling.targetVolume).toBe(125);
    expect(live?.rolling.attainmentBp).toBe(7_200);
  });

  it('🔴 ne touche NI les volumes NI les fenêtres', () => {
    // Ils viennent d'une mesure sur les commandes du client : ils ne dépendent
    // pas du prix. Les faire bouger donnerait un objectif qui suit ce qu'on
    // fait, donc toujours atteint — le défaut que le serveur évite déjà en
    // calculant sur le volume de RÉFÉRENCE.
    const before = measured();
    const live = liveEffort(before, CANONICAL, 160_000);

    expect(live?.rolling.baselineVolume).toBe(before.rolling.baselineVolume);
    expect(live?.rolling.observedVolume).toBe(before.rolling.observedVolume);
    expect(live?.rolling.baseline).toEqual(before.rolling.baseline);
    expect(live?.rolling.observed).toEqual(before.rolling.observed);
    expect(live?.rolling.conclusive).toBe(before.rolling.conclusive);
  });

  it('rend ×1,00 au tarif catalogue — on ne baisse rien, il n’y a rien à rattraper', () => {
    expect(liveEffort(measured(), CANONICAL, CANONICAL)?.isoRevenueRatioBp).toBe(10_000);
  });

  it('descend sous ×1 quand le prix MONTE : on peut vendre moins', () => {
    // Un supplément est une altération comme une autre, et la formule reste
    // vraie dans ce sens-là.
    expect(liveEffort(measured(), CANONICAL, 250_000)?.isoRevenueRatioBp).toBe(8_000);
  });

  it('rend un ratio NUL sur un article offert — aucun volume ne rattrape zéro', () => {
    // `null` plutôt qu'« ×∞ » ou un `NaN` après arrondi : les deux traversaient
    // l'écran.
    const live = liveEffort(measured(), CANONICAL, 0);

    expect(live?.isoRevenueRatioBp).toBeNull();
    expect(live?.rolling.targetVolume).toBeNull();
    // Sans objectif, pas d'écart à mesurer : « 0 % » ferait passer une absence
    // de mesure pour un échec.
    expect(live?.rolling.attainmentBp).toBeNull();
  });
});

describe('ce qui reste tel quel', () => {
  it('rend la mesure du SERVEUR tant que rien n’est tapé', () => {
    // C'est bien la question tant qu'on n'a pas commencé à négocier : quel
    // effort le prix POSÉ demande-t-il aujourd'hui.
    const before = measured();

    expect(liveEffort(before, CANONICAL, null)).toBe(before);
  });

  it('rend `null` quand rien n’a été mesuré', () => {
    // Une colonne vide dit « on ne sait pas », ce qui est la vérité. Un ratio
    // sans volume derrière aurait l'air d'une mesure.
    expect(liveEffort(null, CANONICAL, 160_000)).toBeNull();
  });

  it('laisse `sinceChange` absent quand il l’était — un article sans règle n’a pas d’avant', () => {
    const live = liveEffort({ ...measured(), sinceChange: null }, CANONICAL, 160_000);

    expect(live?.sinceChange).toBeNull();
    expect(live?.rolling.targetVolume).toBe(125);
  });
});

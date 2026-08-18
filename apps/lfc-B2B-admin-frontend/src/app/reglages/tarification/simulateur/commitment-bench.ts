import type { PriceProjectionPointView } from '@lfd/contracts';

/**
 * **Le banc d'essai temporel** — l'engagement de volume, éprouvé sur sa
 * trajectoire ET sur ce qui se passe quand la promesse n'est pas tenue.
 *
 * Ce qui se décide ici : quels niveaux de cumul valent d'être sondés, et
 * comment les regrouper en scénarios. Aucun prix n'y est calculé — chacun vient
 * de `POST /admin/pricing/projection`, donc de la fonction qui facture.
 *
 * Le mode ponctuel répond à « à cette quantité, combien ? ». Celui-ci répond à
 * la question qui compte pour un engagement : « et s'il n'en prend que 70 % ? ».
 * C'est là que le barème sur cumul se distingue du prix fixe, et c'est donc la
 * seule chose que ce banc doit rendre visible.
 */

/**
 * Les trois scénarios, en pourcentage du volume promis.
 *
 * Le manque et l'excédent **encadrent** la promesse plutôt que de la commenter :
 * un tableau qui n'afficherait que le nominal laisserait croire que la question
 * est le prix, alors qu'elle est le risque.
 */
export const SCENARIOS: readonly { readonly key: string; readonly bp: number }[] = [
  { key: 'manque', bp: 7000 },
  { key: 'promesse', bp: 10_000 },
  { key: 'excédent', bp: 13_000 },
];

/** Le plafond de la projection, côté contrat. Trois scénarios × huit échéances. */
export const MAX_POINTS = 24;

/** Une échéance : ce qui est livré, à quel cumul, et à quel prix. */
export interface Installment {
  readonly index: number;
  readonly quantity: number;
  /** Le cumul **après** cette échéance — la mesure sur laquelle le palier se juge. */
  readonly cumulativeQuantity: number;
  readonly unitPriceCents: number;
  readonly lineTotalCents: number;
}

/** Un scénario complet : ses échéances, et ce qu'il coûte en tout. */
export interface Scenario {
  readonly key: string;
  /** Le volume effectivement pris, en pourcentage de la promesse (points de base). */
  readonly bp: number;
  readonly totalQuantity: number;
  readonly totalCents: number;
  /** Le prix moyen réellement payé — le seul nombre comparable entre scénarios. */
  readonly averageUnitCents: number;
  readonly installments: readonly Installment[];
}

/**
 * **Les niveaux de cumul à sonder**, pour tous les scénarios à la fois.
 *
 * Un seul appel les couvre tous : les points sont mis en commun et dédoublonnés,
 * parce que trois scénarios sur la même échelle retombent souvent sur les mêmes
 * niveaux. Le tri est croissant, ce qui rend la réponse lisible même brute.
 *
 * Le nombre d'échéances est **borné par le contrat** (vingt-quatre points) : on
 * répartit donc le budget entre les scénarios plutôt que de tronquer en silence.
 */
export function projectionLevels(promised: number, installments: number): readonly number[] {
  const levels = SCENARIOS.flatMap((scenario) =>
    stepsOf(volumeOf(promised, scenario.bp), installments),
  );
  return [...new Set(levels)]
    .filter((level) => level > 0)
    .sort((left, right) => left - right)
    .slice(0, MAX_POINTS);
}

/** Le volume d'un scénario : la promesse, prise à son pourcentage. */
export function volumeOf(promised: number, bp: number): number {
  return Math.round((promised * bp) / 10_000);
}

/**
 * Les cumuls successifs d'un volume livré en N fois.
 *
 * Le **dernier point vaut exactement le volume**, jamais son arrondi : répartir
 * puis multiplier laisserait un reste, et le tableau afficherait un total qui
 * ne tombe pas juste sous les yeux de celui qui a saisi le chiffre rond.
 */
function stepsOf(volume: number, installments: number): number[] {
  const count = Math.max(1, installments);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? volume : Math.round((volume * (index + 1)) / count),
  );
}

/**
 * **Un scénario, monté depuis les points résolus par le serveur.**
 *
 * Le prix d'une échéance est celui du cumul **atteint à la fin de cette
 * échéance** : c'est ce que fait la résolution, qui inclut la commande en cours
 * dans son propre cumul. Prendre le cumul d'avant décalerait tout le tableau
 * d'une livraison et ferait mentir le total.
 *
 * Un niveau absent de la réponse (la borne du contrat a mordu) rend `null` :
 * afficher un scénario incomplet en le présentant comme un total serait pire
 * que de ne rien afficher.
 */
export function scenarioOf(
  promised: number,
  bp: number,
  installments: number,
  points: readonly PriceProjectionPointView[],
): Scenario | null {
  const byLevel = new Map(points.map((point) => [point.cumulativeQuantity, point]));
  const volume = volumeOf(promised, bp);
  const cumulatives = stepsOf(volume, installments);

  const built: Installment[] = [];
  let previous = 0;
  for (const [index, cumulative] of cumulatives.entries()) {
    const point = byLevel.get(cumulative);
    if (point === undefined) {
      return null;
    }
    const quantity = cumulative - previous;
    built.push({
      index: index + 1,
      quantity,
      cumulativeQuantity: cumulative,
      unitPriceCents: point.unitPriceCents,
      lineTotalCents: point.unitPriceCents * quantity,
    });
    previous = cumulative;
  }

  const totalCents = built.reduce((sum, line) => sum + line.lineTotalCents, 0);
  return {
    key: SCENARIOS.find((scenario) => scenario.bp === bp)?.key ?? 'scénario',
    bp,
    totalQuantity: volume,
    totalCents,
    // Arrondi au centime : c'est un indicateur de comparaison, pas un prix
    // facturé. Le total, lui, est exact — il est la somme de prix résolus.
    averageUnitCents: volume === 0 ? 0 : Math.round(totalCents / volume),
    installments: built,
  };
}

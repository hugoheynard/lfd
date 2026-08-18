/**
 * **Le chiffre d'affaires d'un article, en fonction du volume.**
 *
 * Ce modèle existe pour une raison qu'on ne voit pas sans le tracer : **« même
 * prix à 10 000 » et « même chiffre à 10 000 » ne sont pas la même offre.** Un
 * barème qui atteint 1,80 € à la dix-millième unité a facturé toutes les
 * précédentes plus cher — il rapporte donc STRICTEMENT plus qu'un prix fixe à
 * 1,80 €, à tout volume. Les deux courbes ne se croisent jamais.
 *
 * D'où deux calibrages, et il faut choisir lequel on regarde :
 *
 * - sur **le prix annoncé** — ce que le client entend. Le barème est alors plus
 *   cher partout, et l'écart mesure ce que la progressivité nous rapporte ;
 * - sur **le chiffre total** — ce que nous encaissons. Le prix fixe vaut alors
 *   le prix MOYEN du barème, les deux courbes se croisent au volume promis, et
 *   l'écart change de signe : sous le volume nous sommes devant, au-dessus nous
 *   sommes derrière. C'est ce calibrage-là qui montre le partage de la charge
 *   d'une sortie anticipée.
 *
 * **Pourquoi le calcul est ici et non au serveur.** Une mercuriale SCELLE la
 * chaîne : ni palier de volume ni promotion ne s'ajoutent par-dessus. Le prix
 * facturé sous mercuriale est donc le prix du palier, relevé par la limite s'il
 * passe dessous — la même dérivation que la colonne « prix final » de la grille,
 * et rien de plus. Un aller-retour serveur à chaque frappe ne changerait pas un
 * centime au résultat.
 *
 * Cela vaut **tant que la mercuriale scelle**. Le jour où une promotion pourra
 * s'empiler (l'override explicite prévu), cette simulation devra passer par la
 * fonction qui facture, comme la grille des paliers l'a toujours fait.
 */

/** Un palier : à partir de cette quantité cumulée, ce prix unitaire. */
export interface ScenarioTier {
  readonly minQuantity: number;
  readonly unitPriceCents: number;
}

/** Une manière d'arriver au prix. Le prix fixe est la grille à un seul palier. */
export interface Scenario {
  readonly id: string;
  readonly label: string;
  readonly tiers: readonly ScenarioTier[];
}

/** Ce qui ne dépend pas du scénario : le tarif d'entrée, et ce qui borne en bas. */
export interface ArticleBasis {
  readonly catalogCents: number;
  readonly floorCents: number | null;
}

export interface CurvePoint {
  readonly volume: number;
  readonly revenueCents: number;
}

/**
 * **Le prix unitaire à une quantité cumulée donnée.**
 *
 * Sous le premier seuil, aucun palier ne s'applique : c'est le **tarif
 * catalogue** qui est facturé, pas le premier palier. Une grille qui ne s'ouvre
 * qu'à 500 laisse donc les 499 premières au prix public — et la courbe doit le
 * montrer, sinon elle promet une remise que la caisse n'accorde pas.
 *
 * La limite s'applique en dernier, ici comme à la caisse.
 */
export function unitPriceCentsAt(
  scenario: Scenario,
  basis: ArticleBasis,
  quantity: number,
): number {
  let winner: ScenarioTier | null = null;
  for (const tier of scenario.tiers) {
    if (quantity >= tier.minQuantity) {
      winner = tier;
    }
  }
  const raw = winner === null ? basis.catalogCents : winner.unitPriceCents;
  return basis.floorCents === null ? raw : Math.max(raw, basis.floorCents);
}

/**
 * **Le chiffre encaissé pour un volume**, unité par unité.
 *
 * C'est une somme progressive et non `volume × prix du palier atteint`, parce
 * que **le passé ne se refacture pas** : chaque commande est facturée au palier
 * en vigueur à son instant, et franchir un seuil ne recrédite pas les unités
 * déjà livrées. C'est précisément ce qui rend un barème protecteur — le client
 * qui s'arrête à mi-parcours a payé ses premières unités au prix fort.
 *
 * **L'approximation, dite en clair** : le modèle facture unité par unité, alors
 * que la caisse facture ligne par ligne, au palier du cumul à cet instant. Une
 * commande qui enjambe un seuil part donc en entier au palier d'avant. L'écart
 * est de l'ordre d'une commande, pas d'une saison — mais il existe, et il joue
 * en notre faveur, jamais contre.
 */
export function revenueCentsAt(scenario: Scenario, basis: ArticleBasis, volume: number): number {
  const marks = breakpoints(scenario);
  let total = 0;
  for (const [index, from] of marks.entries()) {
    if (volume < from) {
      break;
    }
    const next = marks[index + 1] ?? Number.POSITIVE_INFINITY;
    const upTo = Math.min(volume, next - 1);
    total += (upTo - from + 1) * unitPriceCentsAt(scenario, basis, from);
  }
  return total;
}

/** Les quantités où le prix change : 1, puis chaque seuil. */
function breakpoints(scenario: Scenario): readonly number[] {
  const marks = new Set<number>([1]);
  for (const tier of scenario.tiers) {
    if (tier.minQuantity > 1) {
      marks.add(tier.minQuantity);
    }
  }
  return [...marks].sort((left, right) => left - right);
}

/**
 * Sur quoi le prix fixe de référence s'aligne. Les deux réponses sont vraies,
 * et elles ne racontent pas la même négociation.
 */
export type Calibration = 'headline' | 'revenue';

/**
 * **Le prix fixe de référence** — déduit, jamais saisi.
 *
 * Le déduire est ce qui rend la comparaison honnête : les deux scénarios tiennent
 * la même promesse au même volume, et tout écart entre eux est un écart de
 * structure, pas un écart d'offre.
 *
 * - `headline` : le prix que le barème atteint au volume promis. C'est ce que le
 *   client retient de l'appel — et le barème lui coûtera davantage.
 * - `revenue` : le prix MOYEN payé sur le volume promis. Les deux offres pèsent
 *   alors le même chiffre à l'arrivée, à l'arrondi du centime près, et ne
 *   diffèrent plus que par la répartition dans le temps.
 */
export function fixedEquivalent(
  scenario: Scenario,
  basis: ArticleBasis,
  targetVolume: number,
  calibration: Calibration,
): Scenario {
  const unitPriceCents =
    calibration === 'headline'
      ? unitPriceCentsAt(scenario, basis, targetVolume)
      : (averageUnitCents(scenario, basis, targetVolume) ??
        unitPriceCentsAt(scenario, basis, targetVolume));
  return {
    id: 'fixe',
    label: 'Prix fixe',
    // Le prix de référence est déjà relevé s'il le fallait : le repasser par la
    // limite ne changerait rien, mais un scénario dont le prix ignore la limite
    // ferait mentir la courbe le jour où le calibrage changera.
    tiers: [{ minQuantity: 1, unitPriceCents: Math.max(unitPriceCents, basis.floorCents ?? 0) }],
  };
}

/**
 * **Où échantillonner.**
 *
 * La courbe est linéaire par morceaux : une grille régulière arrondit les coins,
 * et les coins sont exactement ce qu'on regarde. Chaque seuil est donc
 * échantillonné avec ses deux voisins immédiats — sans le point juste avant, la
 * marche se dessine en pente douce et le graphique ment à l'endroit qui compte.
 */
export function volumeSamples(
  scenarios: readonly Scenario[],
  targetVolume: number,
  maxVolume: number,
  grid = 48,
): readonly number[] {
  const marks = new Set<number>([1, targetVolume, maxVolume]);
  for (const scenario of scenarios) {
    for (const tier of scenario.tiers) {
      marks.add(tier.minQuantity - 1);
      marks.add(tier.minQuantity);
      marks.add(tier.minQuantity + 1);
    }
  }
  for (let step = 0; step <= grid; step += 1) {
    marks.add(Math.round(1 + (step * (maxVolume - 1)) / grid));
  }
  return [...marks]
    .filter((volume) => volume >= 1 && volume <= maxVolume)
    .sort((left, right) => left - right);
}

export function curveOf(
  scenario: Scenario,
  basis: ArticleBasis,
  volumes: readonly number[],
): readonly CurvePoint[] {
  return volumes.map((volume) => ({
    volume,
    revenueCents: revenueCentsAt(scenario, basis, volume),
  }));
}

/**
 * **Ce que le barème a sécurisé de plus que le prix fixe**, à chaque volume.
 *
 * Calibré sur le chiffre, l'écart part de zéro, culmine juste avant le volume
 * promis, y revient à zéro, puis passe **négatif** : l'excédent part au dernier
 * palier. La bosse est la charge de sortie anticipée portée par le client, sans
 * qu'aucune clause n'ait été écrite ; la partie négative est ce que nous
 * concédons s'il commande plus que promis.
 *
 * Calibré sur le prix annoncé, l'écart ne redescend jamais : il monte jusqu'au
 * volume promis puis reste **plat**. C'est la prime que la progressivité nous
 * rapporte, et elle est acquise dès que le volume est atteint.
 */
export function gapCents(
  ladder: readonly CurvePoint[],
  fixed: readonly CurvePoint[],
): readonly CurvePoint[] {
  return ladder.map((point, index) => ({
    volume: point.volume,
    revenueCents: point.revenueCents - (fixed[index]?.revenueCents ?? 0),
  }));
}

/** Le prix moyen réellement payé à ce volume — l'argument que le client opposera. */
export function averageUnitCents(
  scenario: Scenario,
  basis: ArticleBasis,
  volume: number,
): number | null {
  if (volume < 1) {
    return null;
  }
  return Math.round(revenueCentsAt(scenario, basis, volume) / volume);
}

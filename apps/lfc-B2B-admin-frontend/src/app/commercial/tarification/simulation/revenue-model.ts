/**
 * **Le chiffre d'affaires d'un article, en fonction du volume.**
 *
 * Ce modèle existe pour une raison qu'on ne voit pas sans le tracer : **« même
 * prix à 10 000 » et « même chiffre à 10 000 » ne sont pas la même offre.** Un
 * barème qui atteint 1,80 € à la dix-millième unité a facturé toutes les
 * précédentes plus cher — il rapporte donc STRICTEMENT plus qu'un prix fixe à
 * 1,80 €, à tout volume. Les deux courbes ne se croisent jamais.
 *
 * Le prix fixe auquel on la compare est donc **choisi**, pas déduit : c'est une
 * offre alternative que le commercial aurait pu faire, et lui seul sait laquelle.
 * Deux valeurs se calculent pourtant et méritent d'être proposées, parce qu'elles
 * bornent la discussion :
 *
 * - **le prix annoncé** — celui que le barème atteint au volume promis. Le
 *   comparer à lui montre ce que la progressivité nous rapporte en plus ;
 * - **le prix moyen** — celui réellement payé sur le volume promis. À ce prix-là
 *   les deux offres pèsent le même chiffre à l'arrivée, et ne diffèrent plus que
 *   par la répartition dans le temps : c'est le seul point où les courbes se
 *   croisent, donc la seule lecture qui montre le partage d'une sortie anticipée.
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
 * **Le prix fixe auquel on compare** — une offre, pas un calcul.
 *
 * Il est saisi et non déduit : « si je lui avais fait 1,30 € tout du long » est
 * une question que seul le commercial peut poser, et aucune formule ne la devine.
 * Les deux valeurs remarquables (prix annoncé, prix moyen) sont proposées comme
 * points de départ, jamais imposées.
 *
 * La limite s'applique ici aussi : un prix fixe sous le plancher serait une offre
 * que la caisse relèverait, et la courbe la montrerait tenue.
 */
export function fixedScenario(unitPriceCents: number, basis: ArticleBasis): Scenario {
  return {
    id: 'fixe',
    label: 'Prix fixe',
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
 * Sa forme dit tout du prix fixe choisi. Au **prix moyen**, l'écart part de
 * zéro, culmine avant le volume promis, y revient, puis passe **négatif** : la
 * bosse est la charge de sortie anticipée portée par le client sans qu'aucune
 * clause n'ait été écrite, et la partie négative est ce que nous concédons s'il
 * commande plus que promis. Au **prix annoncé**, l'écart ne redescend jamais :
 * il monte jusqu'au volume promis puis reste plat. Entre les deux, il se déforme
 * continûment — et c'est précisément ce qu'on vient regarder en le déplaçant.
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

/**
 * **Une grille de prix** — la forme partagée par le gabarit et la mercuriale.
 *
 * Les deux portent exactement la même chose : des articles, chacun avec des
 * paliers de quantité. Un gabarit est une grille **préparée** ; une mercuriale
 * est une grille **posée** chez un client, sur une fenêtre. Ce qui les
 * distingue tient à ce qu'elles font, pas à ce qu'elles contiennent.
 *
 * D'où ce module : les trois refus qui rendent une grille cohérente s'écrivent
 * **une fois**. Les dupliquer aurait donné deux définitions de « grille valide »
 * qui divergent au premier ajout — et c'est un prix qu'on n'explique plus.
 *
 * ## Pourquoi les refus sont injectés
 *
 * La logique est commune, **les messages ne le sont pas**. Un commercial qui
 * pose une mercuriale sur la fiche d'un client ne doit pas lire « ce gabarit
 * comporte deux fois le même article » : il n'est pas sur un gabarit, et il
 * chercherait une page qu'il n'a pas ouverte. Les messages d'erreur de ce dépôt
 * sont lus par du personnel qui n'a pas le code sous les yeux.
 *
 * Chaque agrégat apporte donc ses propres erreurs, et garde le même contrôle.
 */

/** Un palier : à partir de cette quantité, ce prix unitaire en millicentimes. */
export interface PricingTier {
  readonly minQuantity: number;
  readonly unitPriceMillicents: number;
}

/** Une ligne de grille : un article, ses paliers. */
export interface PricingGridLine {
  readonly sku: string;
  readonly tiers: readonly PricingTier[];
}

/**
 * Ce que l'agrégat lève quand la grille ne tient pas. Trois cas, trois phrases
 * dans SON vocabulaire.
 */
export interface GridRefusals {
  /** Aucune ligne, ou une ligne sans palier. */
  empty(): Error;
  /** Deux lignes sur le même article. */
  duplicateSku(sku: string): Error;
  /** Un palier qui ne récompense pas la quantité — ou deux au même seuil. */
  nonDecreasing(sku: string, minQuantity: number): Error;
}

/**
 * La grille **triée et vérifiée**, ou une erreur.
 *
 * Générique sur la ligne : le gabarit en porte une de plus (`plannedVolume`)
 * que la mercuriale, et rien ici n'a à le savoir. Ce qui revient est la même
 * ligne, ses paliers remis en ordre.
 *
 * @throws l'une des trois erreurs de `refusals`.
 */
export function normalizeGrid<L extends PricingGridLine>(
  lines: readonly L[],
  refusals: GridRefusals,
): readonly L[] {
  if (lines.length === 0) {
    throw refusals.empty();
  }
  assertNoDuplicateSku(lines, refusals);
  return lines.map((line) => ({ ...line, tiers: normalizeTiers(line, refusals) }));
}

/**
 * Les paliers d'une ligne, triés puis vérifiés.
 *
 * Le tri est fait **ici** plutôt que refusé : l'ordre de saisie n'est pas une
 * décision, et rendre une erreur pour un tableau dans le désordre ferait perdre
 * une grille entière pour une question de présentation. Ce qui est refusé est
 * ce qui reste incohérent **une fois trié**.
 */
function normalizeTiers(line: PricingGridLine, refusals: GridRefusals): readonly PricingTier[] {
  if (line.tiers.length === 0) {
    throw refusals.empty();
  }
  const tiers = [...line.tiers].sort((left, right) => left.minQuantity - right.minQuantity);
  for (const [index, tier] of tiers.entries()) {
    const previous = tiers[index - 1];
    if (previous === undefined) {
      continue;
    }
    // Seuil identique : deux paliers au même endroit ne se départagent pas.
    // Prix qui remonte : commander plus coûterait plus cher.
    if (
      previous.minQuantity === tier.minQuantity ||
      previous.unitPriceMillicents <= tier.unitPriceMillicents
    ) {
      throw refusals.nonDecreasing(line.sku, tier.minQuantity);
    }
  }
  return tiers;
}

function assertNoDuplicateSku(lines: readonly PricingGridLine[], refusals: GridRefusals): void {
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.sku)) {
      throw refusals.duplicateSku(line.sku);
    }
    seen.add(line.sku);
  }
}

import type { MercurialeBenchmarkView } from "@lfd/contracts";

/** Le prix d'entrée d'un client sur un article — une observation du marché. */
export interface NegotiatedPrice {
  readonly sku: string;
  readonly companyId: string;
  readonly unitPriceMillicents: number;
}

/**
 * **Où se situe un prix par rapport à ce que les autres paient déjà.**
 *
 * Une observation par **client** et non par règle : une mercuriale à trois
 * paliers pèserait sinon trois fois plus lourd qu'un prix fixe, et un gros
 * compte déplacerait la médiane à lui seul en négociant des paliers. Le prix
 * retenu est celui du **plus petit seuil** — le même choix que la grille, pour la
 * même raison : ce qu'un client paie quand il commande peu est ce qui se compare.
 *
 * La **médiane** et non la moyenne : sur dix clients, un contrat exceptionnel
 * tirerait la moyenne et ferait passer un prix normal pour une largesse.
 */
export function benchmarkByProduct(
  observations: readonly NegotiatedPrice[],
): readonly MercurialeBenchmarkView[] {
  const bySku = new Map<string, Map<string, number>>();
  for (const observation of observations) {
    const perCompany = bySku.get(observation.sku) ?? new Map<string, number>();
    // Le plus HAUT prix d'un même client sur un même article : les paliers ne
    // pouvant que descendre, c'est celui du plus petit seuil.
    const known = perCompany.get(observation.companyId);
    perCompany.set(
      observation.companyId,
      known === undefined
        ? observation.unitPriceMillicents
        : Math.max(known, observation.unitPriceMillicents),
    );
    bySku.set(observation.sku, perCompany);
  }

  return [...bySku.entries()].map(([sku, perCompany]) => {
    const prices = [...perCompany.values()].sort((left, right) => left - right);
    return {
      sku,
      medianMillicents: medianOf(prices),
      lowMillicents: prices[0] ?? 0,
      highMillicents: prices.at(-1) ?? 0,
      companyCount: prices.length,
    };
  });
}

/**
 * La médiane d'une liste **déjà triée**.
 *
 * Sur un nombre pair d'observations, la moyenne des deux du milieu — arrondie au
 * centime, parce qu'un prix affiché en millièmes n'a pas de sens dans un écran
 * où tout le reste est un montant facturable.
 */
function medianOf(sorted: readonly number[]): number {
  if (sorted.length === 0) {
    return 0;
  }
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? 0;
  }
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

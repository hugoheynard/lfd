/**
 * La **comparaison qui autorise la bascule**.
 *
 * Le seed du backend est l'autorité de prix au checkout depuis l'ouverture
 * commerciale : le remplacer par le catalogue reçu du PIM change le montant
 * facturé à de vrais clients. Cette comparaison est l'étape 2 du plan de
 * bascule (`architecture-catalogue-synchronise.md`), et elle est non
 * négociable — un écart silencieux facture le mauvais prix sans rien signaler.
 *
 * **Pure** : elle prend deux listes et rend un constat. Aucune base, aucune
 * horloge, aucun réseau — ce qui permet de l'éprouver par énumération plutôt
 * qu'en fabriquant un environnement.
 *
 * ⚠️ Cette pièce est **temporaire par construction**. Elle meurt avec le seed,
 * à la slice C7. La garder après ferait vivre un comparateur sans rien à
 * comparer, donc un écran qui rassure sans rien mesurer.
 */

/** Un article tel que le seed le connaît aujourd'hui — l'autorité en place. */
export interface SeedEntry {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceCents: number;
  readonly vatRate: number;
}

/**
 * Un article tel que le PIM l'a poussé.
 *
 * `productSku` est la **clé de rapprochement**, pas `sku` : le PIM vend la
 * déclinaison (`VIE-001-1`), le seed vend le produit (`VIE-001`). Comparer les
 * `sku` bruts rendrait 92 disparitions et 92 apparitions, ce qui cacherait
 * exactement les écarts qu'on cherche.
 *
 * `isDefault` désigne **laquelle** des déclinaisons répond du produit. Sans lui,
 * un carton de 50 écrase l'unité dans l'index et le rapport annonce qu'un
 * croissant coûte 60 € — un faux écart au moment précis où on décide d'une
 * bascule d'argent.
 */
export interface ReceivedEntry {
  readonly sku: string;
  readonly productSku: string;
  readonly isDefault: boolean;
  readonly name: string;
  readonly unitPriceCents: number;
  readonly vatRate: number;
}

/** Un écart sur une valeur, dit avec les deux versions — jamais juste « diffère ». */
export interface FieldGap<T> {
  readonly sku: string;
  readonly seed: T;
  readonly received: T;
}

export interface ParityReport {
  readonly seedCount: number;
  readonly receivedCount: number;
  /**
   * Vendus aujourd'hui, absents du catalogue reçu. **Le pire cas** : après la
   * bascule, un client qui les commande verrait son panier refusé.
   */
  readonly missing: readonly string[];
  /** Reçus, inconnus du seed. Des nouveautés — à confirmer, pas à craindre. */
  readonly extra: readonly string[];
  /** Le prix change. Chaque ligne est de l'argent, et se relit une par une. */
  readonly priceGaps: readonly FieldGap<number>[];
  /** Le taux de TVA change — attendu, puisque le seed le code en dur à 5,5 %. */
  readonly vatGaps: readonly FieldGap<number>[];
  readonly nameGaps: readonly FieldGap<string>[];
  /**
   * `true` **seulement** si rien ne bouge. Un booléen plutôt qu'un score : la
   * question posée est « peut-on basculer sans rien expliquer ? », et elle n'a
   * pas de réponse nuancée.
   */
  readonly identical: boolean;
}

/**
 * Rapproche les deux catalogues par **SKU produit**, sur la déclinaison **par
 * défaut**.
 *
 * Une déclinaison non-`isDefault` (un futur conditionnement) n'a pas de
 * correspondant dans le seed : elle apparaît en `extra`, ce qui est le constat
 * juste — c'est bien un article que la boutique ne vendait pas.
 */
export function compareCatalogs(
  seed: readonly SeedEntry[],
  received: readonly ReceivedEntry[],
): ParityReport {
  const receivedByProductSku = new Map(
    received.filter((entry) => entry.isDefault).map((entry) => [entry.productSku, entry]),
  );
  const seenProductSkus = new Set<string>();

  const missing: string[] = [];
  const priceGaps: FieldGap<number>[] = [];
  const vatGaps: FieldGap<number>[] = [];
  const nameGaps: FieldGap<string>[] = [];

  for (const entry of seed) {
    const match = receivedByProductSku.get(entry.sku);
    if (match === undefined) {
      missing.push(entry.sku);
      continue;
    }
    seenProductSkus.add(entry.sku);

    if (match.unitPriceCents !== entry.unitPriceCents) {
      priceGaps.push({
        sku: entry.sku,
        seed: entry.unitPriceCents,
        received: match.unitPriceCents,
      });
    }
    if (match.vatRate !== entry.vatRate) {
      vatGaps.push({ sku: entry.sku, seed: entry.vatRate, received: match.vatRate });
    }
    if (match.name !== entry.name) {
      nameGaps.push({ sku: entry.sku, seed: entry.name, received: match.name });
    }
  }

  // Non-défaut ⇒ toujours en plus : le seed ne connaissait qu'une unité par
  // produit. Défaut sans correspondant ⇒ nouveauté.
  const extra = received
    .filter((entry) => !entry.isDefault || !seenProductSkus.has(entry.productSku))
    .map((entry) => entry.sku);

  return {
    seedCount: seed.length,
    receivedCount: received.length,
    missing,
    extra,
    priceGaps,
    vatGaps,
    nameGaps,
    identical:
      missing.length === 0 &&
      extra.length === 0 &&
      priceGaps.length === 0 &&
      vatGaps.length === 0 &&
      nameGaps.length === 0,
  };
}

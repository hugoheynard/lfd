import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { type DecisionClientele, ensureOnSale } from "../../domain/services/sale-references.js";

/**
 * **Lire puis juger** les références qu'un geste tarifaire vise — la lecture
 * au port, le refus au domaine (`ensureOnSale`). Une portée de famille ou
 * globale ne vise aucune référence : rien n'est lu.
 */
export async function assertOnSale(
  references: SaleReferenceReader,
  skus: readonly (string | null)[],
  clientele: DecisionClientele,
): Promise<void> {
  const wanted = skus.filter((sku): sku is string => sku !== null);
  if (wanted.length === 0) {
    return;
  }
  ensureOnSale(wanted, await references.standingOf(wanted), clientele);
}

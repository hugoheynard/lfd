import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { ReservedElsewhereReader } from "../../domain/ports/reserved-elsewhere.reader.js";
import { ReservedArticleRefusedError } from "../../../catalog/domain/errors/reserved-article-refused.error.js";
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

/**
 * **Une ligne de mercuriale ne vise pas un article réservé à un autre compte**
 * (`plan-articles-sur-mesure.md`, Q1) — le filet derrière l'écran, qui ne
 * propose déjà que les articles auxquels le client a droit.
 *
 * @throws {ReservedArticleRefusedError} le premier SKU réservé ailleurs.
 */
export async function assertNotReservedElsewhere(
  reservations: ReservedElsewhereReader,
  companyId: string,
  skus: readonly string[],
): Promise<void> {
  const [first] = await reservations.among(companyId, skus);
  if (first !== undefined) {
    throw new ReservedArticleRefusedError(first);
  }
}

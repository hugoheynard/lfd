import type { Product } from "../domain/entities/product.js";
import type {
  LineageOrigin,
  LineageProduct,
  DetachmentLineageReader,
} from "../domain/ports/detachment-lineage.reader.js";

/** La filiation servie au détail — cf. `ProductLineageView` du contrat. */
export interface ProductLineage {
  readonly origin: LineageOrigin | null;
  readonly detachedTo: Readonly<Record<string, LineageProduct>>;
}

/**
 * Nomme les deux côtés d'un détachement pour le détail d'une fiche
 * (`plan-gestes-de-declinaison.md`, G2) : d'où elle vient, et ce que ses
 * déclinaisons archivées sont devenues.
 */
export async function detachmentLineageOf(
  reader: DetachmentLineageReader,
  product: Product,
): Promise<ProductLineage> {
  const snapshot = product.persistenceSnapshot();
  const detached = snapshot.variants.flatMap((variant) =>
    variant.detachedToProductId == null ? [] : [[variant.id, variant.detachedToProductId] as const],
  );
  const [origin, named] = await Promise.all([
    snapshot.originVariantId == null ? null : reader.originOf(snapshot.originVariantId),
    reader.productsNamed(detached.map(([, productId]) => productId)),
  ]);
  const detachedTo: Record<string, LineageProduct> = {};
  for (const [variantId, productId] of detached) {
    const target = named.get(productId);
    if (target !== undefined) {
      detachedTo[variantId] = target;
    }
  }
  return { origin, detachedTo };
}

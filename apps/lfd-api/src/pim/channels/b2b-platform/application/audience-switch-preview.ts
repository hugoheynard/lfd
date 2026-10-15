import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { AudienceSwitchItemView, AudienceSwitchPreviewView } from "@lfd/pim-contracts";

import { CatalogueReader } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import type { ProductRecord } from "../../../catalogue/product/domain/ports/product.repository.js";
import { sellsContext } from "../../../catalogue/shared/domain/value-objects/sales-channels.js";
import { ROOT_CONTEXT_KEY } from "../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";
import { B2bMembershipService } from "../membership/membership.service.js";

export class GetAudienceSwitchPreviewQuery {}

/**
 * **L'aperçu de la bascule vers l'audience** (1f du plan
 * `plan-catalogue-synchronise-par-audience.md`, étape 1 de C7) : les trois
 * écarts entre « publié au référentiel » et « vendu aux pros » qu'aujourd'hui
 * le lien au canal et la matrice créent, et que l'audience fera disparaître.
 *
 * Vit dans le canal et non dans le catalogue : elle lit le lien au canal, et
 * la dépendance va du canal vers le catalogue, jamais l'inverse (ADR-13).
 *
 * Lecture seule — elle ne corrige rien ; elle rend la liste que Hugo relit
 * avant que la bascule n'écrive le moindre statut (H7, H10).
 */
@QueryHandler(GetAudienceSwitchPreviewQuery)
export class GetAudienceSwitchPreviewHandler implements IQueryHandler<
  GetAudienceSwitchPreviewQuery,
  AudienceSwitchPreviewView
> {
  constructor(
    private readonly catalogue: CatalogueReader,
    private readonly membership: B2bMembershipService,
  ) {}

  async execute(): Promise<AudienceSwitchPreviewView> {
    const [live, boundIds] = await Promise.all([
      this.catalogue.publishable(),
      this.membership.publishedProductIds(),
    ]);
    const bound = new Set(boundIds);
    const published = live.filter((product) => product.status === "published");
    // `byIds` et non `publishable` : une fiche liée puis ARCHIVÉE est l'écart
    // le plus net, et `publishable` écarte les archivées.
    const [boundProducts, channels] = await Promise.all([
      this.catalogue.byIds(boundIds),
      this.catalogue.effectiveChannels(published),
    ]);
    return {
      publishedUnbound: listed(published.filter((product) => !bound.has(product.id))),
      boundUnpublished: listed(boundProducts.filter((product) => product.status !== "published")),
      publishedB2bClosed: listed(
        published.filter(
          (product) => !sellsContext(channels.get(product.id) ?? [], ROOT_CONTEXT_KEY),
        ),
      ),
    };
  }
}

/** Les fiches, citées par SKU — l'ordre que l'écran affiche. */
function listed(products: readonly ProductRecord[]): AudienceSwitchItemView[] {
  return products
    .map((product) => ({ id: product.id, sku: product.sku, name: product.name.fr }))
    .sort((left, right) => left.sku.localeCompare(right.sku));
}

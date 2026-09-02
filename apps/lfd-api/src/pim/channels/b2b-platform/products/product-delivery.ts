import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { B2bDeliveryFactsView, B2bProductDeliveryView } from "@lfd/pim-contracts";

import { ProductNotFoundError } from "../../../catalogue/product/domain/errors/product-errors.js";
import { CatalogueReader } from "../../../catalogue/shared/domain/ports/catalogue-reader.js";
import { B2bMembershipService } from "../membership/membership.service.js";
import { B2bDeliveryFactsReader } from "./delivery-facts.reader.js";

export class GetB2bProductDeliveryQuery {
  constructor(readonly productId: string) {}
}

/**
 * **La frise : la décision, l'envoi, l'acceptation.**
 *
 * Trois dates, trois provenances, et c'est tout le sujet. `publishedAt` est une
 * décision du référentiel ; `lastPushedAt` un acte technique qui peut échouer,
 * traîner ou n'avoir jamais eu lieu ; `factsReceivedAt` un fait de l'autre
 * côté, que seul le port de retour peut donner. Les rapprocher est la seule
 * façon de voir **lequel des trois manque** — l'écran savait dire les deux
 * premiers, et une fiche poussée que la plateforme n'avait pas acceptée
 * s'affichait exactement comme une fiche en vente.
 *
 * ⚠️ Une requête, pas une commande : elle ne pose ni ancre, ni estampille, et
 * n'écrit rien. La lire ne doit jamais changer l'état de ce qu'elle décrit.
 *
 * @throws {ProductNotFoundError} la fiche n'existe pas.
 */
@QueryHandler(GetB2bProductDeliveryQuery)
export class GetB2bProductDeliveryHandler implements IQueryHandler<
  GetB2bProductDeliveryQuery,
  B2bProductDeliveryView
> {
  constructor(
    // `CatalogueReader` et non `ProductRepository` : c'est le SEUL point
    // d'entrée d'un adaptateur de canal dans le catalogue (ADR-13). Le dépôt
    // rendrait l'agrégat, donc le pouvoir de le muter, à une lecture qui n'en a
    // que faire.
    private readonly catalogue: CatalogueReader,
    private readonly membership: B2bMembershipService,
    private readonly platform: B2bDeliveryFactsReader,
  ) {}

  async execute(query: GetB2bProductDeliveryQuery): Promise<B2bProductDeliveryView> {
    const [product] = await this.catalogue.byIds([query.productId]);
    if (product === undefined) {
      throw new ProductNotFoundError(query.productId);
    }
    const skus = product.variants.map((variant) => variant.sku);

    const [binding, facts] = await Promise.all([
      this.membership.bindingOf(query.productId),
      this.platform.factsFor(skus),
    ]);

    return {
      productId: query.productId,
      publishedAt: binding?.publishedAt ?? null,
      lastPushedAt: binding?.lastPushedAt ?? null,
      // Toutes les déclinaisons, y compris celles que la plateforme ignore :
      // une déclinaison absente de la carte est précisément ce que la frise doit
      // montrer, et la taire ferait croire à une fiche complète.
      variants: skus.map((sku): B2bDeliveryFactsView => {
        const found = facts.get(sku);
        if (found === undefined) {
          return { sku, accepted: false, factsReceivedAt: null, awaitingSince: null };
        }
        return {
          sku,
          accepted: found.accepted,
          factsReceivedAt: found.factsReceivedAt?.toISOString() ?? null,
          awaitingSince: found.awaitingSince?.toISOString() ?? null,
        };
      }),
    };
  }
}

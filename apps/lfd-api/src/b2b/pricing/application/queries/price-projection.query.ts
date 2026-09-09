import { Injectable } from "@nestjs/common";
import type {
  PriceProjectionPayload,
  PriceProjectionPointView,
  PriceProjectionView,
} from "@lfd/contracts";

import { ProductCatalogReader } from "../../../orders/domain/ports/product-catalog.reader.js";
import { UnknownSkuError } from "../../../orders/domain/errors/order-errors.js";
import type { PricedItem } from "../../domain/loaded-pricer.js";
import { PricingMaterialsLoader } from "../pricing-materials.loader.js";

/**
 * **Ce que l'article coûterait à des niveaux de cumul qui n'existent pas encore.**
 *
 * C'est la pièce qui rend le devis TEMPOREL honnête. Rejouer côté écran la règle
 * « le plus haut palier atteint gagne » aurait marché — c'est une ligne — et
 * aurait créé exactement la divergence que tout ce contexte évite : un écran qui
 * désigne un palier, une caisse qui en applique un autre, et l'écart découvert
 * devant le client. Ici chaque point est une **résolution complète**, par le
 * tarificateur qui facture.
 *
 * Les matériaux sont lus **une seule fois** : ils ne dépendent pas du niveau de
 * cumul, seule la résolution en dépend. Vingt-quatre points ne coûtent donc pas
 * vingt-quatre lectures de base.
 *
 * ## 🔴 Ce que la bascule au tarificateur a réparé
 *
 * Cette requête chargeait ses candidats elle-même — c'était la quatrième des
 * cinq recettes du dépôt — et elle avait oublié la mercuriale jusqu'au
 * 2026-09-08 : un client au tarif négocié voyait sa courbe au prix catalogue, un
 * chiffre parfaitement plausible sur l'écran qui sert précisément à décider d'un
 * prix. Elle ne charge plus et ne compose plus : elle demande.
 *
 * La projection ne consulte **aucun** historique et n'écrit rien : elle répond à
 * « si le cumul valait N », pas à « où en est ce client ». Les deux questions se
 * ressemblent et n'ont pas la même réponse — le suivi d'un engagement est
 * ailleurs, et `priceAtCumulative` écarte délibérément les preuves.
 *
 * ## ⚠️ La divergence qui subsiste, dans l'autre sens (2026-09-09)
 *
 * Le paragraphe ci-dessus se félicite de ne pas laisser l'écran désigner un
 * palier que la caisse contredirait. **Une divergence subsiste par l'autre
 * bout** : la porte d'un plancher dynamique se juge sur la quantité d'une
 * COMMANDE, et la charge n'en porte pas — elle ne dit que des cumuls. Le
 * serveur ne l'ouvre donc jamais, tandis que la grille des paliers
 * (`volume-tier-prices.ts`) la rouvre au seuil sondé quand aucun engagement ne
 * couvre l'article. Sur l'écran qui affiche les deux, la courbe peut donc être
 * plus haute que la grille.
 *
 * C'est l'état **assumé** de R15 : la porte a d'abord été fermée parce qu'elle
 * s'ouvrait sur un cumul de saison, ce qui annonçait un prix sous le mur dur.
 * La refermer était le sens prudent ; la juger juste demande que la charge dise
 * quelle commande amène à chaque niveau, ce que l'écran calcule déjà
 * (`commitment-bench.ts`, `quantity = cumulative - previous`) et n'envoie pas.
 */
@Injectable()
export class PriceProjectionQuery {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly materials: PricingMaterialsLoader,
  ) {}

  /** @throws {UnknownSkuError} un SKU que le catalogue ne connaît pas. */
  async project(payload: PriceProjectionPayload, at: Date): Promise<PriceProjectionView> {
    const found = await this.catalog.resolve(payload.sku);
    if (found === null) {
      throw new UnknownSkuError(payload.sku);
    }
    const item: PricedItem = {
      sku: found.sku,
      name: found.name,
      category: found.category,
      canonicalMillicents: found.unitPriceMillicents,
    };

    // Un seul chargement, à la plus petite quantité : les matériaux qui visent
    // l'article ne dépendent ni de la quantité ni du cumul.
    const pricer = await this.materials.pricerFor(
      [{ item, quantity: 1 }],
      { companyId: payload.companyId },
      at,
    );
    if (pricer === null) {
      throw new UnknownSkuError(payload.sku);
    }

    return {
      productName: item.name,
      points: payload.cumulativeQuantities.map((cumulative): PriceProjectionPointView => {
        // La quantité de la commande ET le cumul valent le même nombre : la
        // projection répond à « si ce niveau était atteint », et distinguer les
        // deux supposerait un rythme de livraison que l'écran, lui, connaît — et
        // applique en choisissant les niveaux qu'il demande.
        const priced = pricer.priceAtCumulative(item, cumulative);
        return {
          cumulativeQuantity: cumulative,
          canonicalMillicents: priced.canonicalMillicents,
          unitPriceMillicents: priced.finalMillicents,
          steps: priced.steps.map((step) => ({ ...step })),
          floored: priced.floored,
        };
      }),
    };
  }
}

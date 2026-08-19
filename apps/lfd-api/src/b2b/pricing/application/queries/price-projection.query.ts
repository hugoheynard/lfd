import { Injectable } from "@nestjs/common";
import type {
  PriceProjectionPayload,
  PriceProjectionPointView,
  PriceProjectionView,
} from "@lfd/contracts";

import { decideFloor } from "../../domain/floor-policy.js";
import { pricingContextFor } from "../pricing-context.js";
import { resolveScopedFloor } from "../../domain/resolve-floor.js";
import { resolvePrice } from "../../domain/resolve-price.js";
import { ladderAsRule } from "../../domain/volume-ladder.js";
import { PriceFloorReader } from "../../domain/ports/price-floor.reader.js";
import { PriceRuleReader } from "../../domain/ports/price-rule.reader.js";
import { VolumeLadderReader } from "../../domain/ports/volume-ladder.reader.js";
import { ProductCatalogReader } from "../../../orders/domain/ports/product-catalog.reader.js";
import { UnknownSkuError } from "../../../orders/domain/errors/order-errors.js";
import type { PriceRule, PricingContext, ScopedPriceFloor } from "../../domain/price-rule.js";
import type { VolumeLadder } from "../../domain/volume-ladder.js";

/** Ce qui vise l'article, lu une seule fois : rien de tout cela ne dépend du cumul. */
interface Candidates {
  readonly rules: readonly PriceRule[];
  readonly floors: readonly ScopedPriceFloor[];
  readonly ladders: readonly VolumeLadder[];
}

/**
 * **Ce que l'article coûterait à des niveaux de cumul qui n'existent pas encore.**
 *
 * C'est la pièce qui rend le devis TEMPOREL honnête. Rejouer côté écran la règle
 * « le plus haut palier atteint gagne » aurait marché — c'est une ligne — et
 * aurait créé exactement la divergence que tout ce contexte évite : un écran qui
 * désigne un palier, une caisse qui en applique un autre, et l'écart découvert
 * devant le client. Ici chaque point est une **résolution complète**, par la
 * fonction qui facture.
 *
 * Les règles, barèmes et planchers sont lus **une seule fois** : ils ne dépendent
 * pas du niveau de cumul, seule la résolution en dépend. Vingt-quatre points ne
 * coûtent donc pas vingt-quatre lectures de base.
 *
 * La projection ne consulte **aucun** historique et n'écrit rien : elle répond à
 * « si le cumul valait N », pas à « où en est ce client ». Les deux questions se
 * ressemblent et n'ont pas la même réponse — le suivi d'un engagement est ailleurs.
 */
@Injectable()
export class PriceProjectionQuery {
  constructor(
    private readonly catalog: ProductCatalogReader,
    private readonly priceRules: PriceRuleReader,
    private readonly priceFloors: PriceFloorReader,
    private readonly volumeLadders: VolumeLadderReader,
  ) {}

  /** @throws {UnknownSkuError} un SKU que le catalogue ne connaît pas. */
  async project(payload: PriceProjectionPayload, at: Date): Promise<PriceProjectionView> {
    const item = await this.catalog.resolve(payload.sku);
    if (item === null) {
      throw new UnknownSkuError(payload.sku);
    }

    const parties = { companyId: payload.companyId };
    // Un contexte de référence, à la plus petite quantité : il sert à CHARGER
    // les candidats, qui ne dépendent ni de la quantité ni du cumul.
    const base = pricingContextFor(item.sku, item.category, 1, parties, at, 1);
    const [rules, floors, ladders] = await Promise.all([
      this.priceRules.candidatesFor(base),
      this.priceFloors.candidatesFor(base),
      this.volumeLadders.candidatesFor(base),
    ]);

    return {
      productName: item.name,
      points: payload.cumulativeQuantities.map((cumulative) =>
        this.pointAt(item, { rules, floors, ladders }, base, cumulative),
      ),
    };
  }

  /**
   * Un point de la projection.
   *
   * La quantité de la commande ET le cumul valent le même nombre : la projection
   * répond à « si ce niveau était atteint », et distinguer les deux supposerait
   * un rythme de livraison que l'écran, lui, connaît — et applique en choisissant
   * les niveaux qu'il demande.
   */
  private pointAt(
    item: { sku: string; unitPriceCents: number },
    candidates: Candidates,
    base: PricingContext,
    cumulative: number,
  ): PriceProjectionPointView {
    const context: PricingContext = {
      ...base,
      quantity: cumulative,
      cumulativeQuantity: cumulative,
    };
    const volumeRules = candidates.ladders
      .map((ladder) => ladderAsRule(ladder, context))
      .filter((rule): rule is PriceRule => rule !== null);

    const scoped = resolveScopedFloor(candidates.floors, context);
    // Aucune mesure d'historique : la porte du plancher dynamique reste FERMÉE,
    // ce qui est la lecture prudente — une projection ne peut pas prouver un
    // volume observé, et l'ouvrir sur une hypothèse accorderait une remise que
    // rien n'a établie.
    const applied =
      scoped === null
        ? null
        : decideFloor(scoped.policy, { quantity: cumulative, observedVolumeRatioBp: null }).applied;

    const resolved = resolvePrice(
      item.unitPriceCents,
      [...candidates.rules, ...volumeRules],
      context,
      applied,
    );
    return {
      cumulativeQuantity: cumulative,
      canonicalCents: item.unitPriceCents,
      unitPriceCents: resolved.finalCents,
      steps: resolved.steps.map((step) => ({ ...step })),
      floored: resolved.floored,
    };
  }
}

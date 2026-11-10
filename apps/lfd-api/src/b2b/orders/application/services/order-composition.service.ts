import type { Instant } from "../../../../platform/context/request-context.js";
import type { OrderFulfillment as AgreedFulfillment, PickupSnapshot } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { OrderFulfillmentInput } from "../../domain/entities/order-shapes.js";
import type { PricedDraftInput } from "../../domain/entities/order-priced-draft.js";
import {
  type DeliveryDefaults,
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
} from "../../domain/ports/delivery-defaults.reader.js";
import { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import { OrderLineClassificationReader } from "../../domain/ports/order-line-classification.reader.js";
import { handoverMomentOf } from "../../domain/services/handover-moment.js";
import { agreeWithWindow, type WindowRequester } from "../../domain/services/delivery-window.js";
import type { BasketDiscountRefusal } from "../../domain/services/basket-discount-replay.js";
import type {
  BasketPricingContext,
  BasketVerdicts,
} from "../../domain/services/basket-pricing-context.js";
import type { KeptLineRefusal } from "../../domain/services/kept-line-prices.js";
import { CartAdjustments } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderLinePricing } from "./order-line-pricing.service.js";
import { OrderOperations } from "./order-operations.service.js";
import type { OrderParties } from "./order-parties.js";
import {
  loadedOrRefused,
  PricingContext,
  type LoadedBasket,
  type PricingRequest,
} from "./pricing-context.service.js";

/** Un refus de la règle « une modification ne change jamais un prix convenu en silence ». */
export type RevisionPriceRefusal = KeptLineRefusal | BasketDiscountRefusal;

/** Ce qui reste à décider après l'heure limite : l'acheminement convenu, et l'adresse du carnet liée. */
export interface ArrangedContent {
  readonly agreed: AgreedFulfillment;
  readonly bookAddressId: string | null;
}

/**
 * La part de l'entrée de l'agrégat que la composition décide — tout sauf
 * l'identité de la commande (qui, pour qui, au nom de quelles CGV). Pas un
 * montant : l'argent sort de `priceBasket`, que l'agrégat appelle sur
 * `pricing` (plan `le-prix-d-un-panier.md`, § 2.2).
 */
export type ComposedDraft = Pick<
  PricedDraftInput,
  "agreed" | "fulfillment" | "requestedDeliveryDate" | "note" | "pricing"
>;

/**
 * **Le calcul de la passation, partagé avec la révision** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1) : prix
 * ré-résolus, remise de retrait, frais de zone, éligibilité figée par ligne,
 * acheminement convenu.
 *
 * Extrait d'`OrderDrafting` le 2026-10-23 SANS changer son comportement : une
 * seconde copie pour la révision aurait fini par appliquer une autre remise de
 * retrait que la passation, sur le chemin qu'on teste le moins.
 *
 * Ce service ne décide ni qui a le droit, ni l'heure limite, ni le règlement.
 * La seule différence entre les deux usages est `frozen` : en révision, une
 * ligne déjà présente garde son prix figé (R3) et n'est pas re-tarifée.
 *
 * Depuis le lot L1a de `documentation/pricing/centime-et-tva/le-prix-d-un-panier.md`
 * (2026-11-03), il ne calcule plus aucun montant : il CHARGE
 * (`PricingContext`), arrange l'acheminement, et rend la demande de
 * chiffrage que l'agrégat passe à `priceBasket`.
 */
@Injectable()
export class OrderComposition {
  private readonly pricing: PricingContext;

  constructor(
    linePricing: OrderLinePricing,
    adjustments: CartAdjustments,
    private readonly deliveryDefaults: DeliveryDefaultsReader,
    private readonly operations: OrderOperations,
    deliveryVat: OrderDeliveryVatReader,
    classifications: OrderLineClassificationReader,
    audiences: CustomerAudiences,
  ) {
    // Le chargement se monte ici, sur les ports qu'on injectait déjà : le
    // contrat d'injection de la composition ne change pas (lot L1a).
    this.pricing = new PricingContext(
      linePricing,
      adjustments,
      classifications,
      audiences,
      deliveryVat,
    );
  }

  /**
   * **Charge le panier** (`PricingContext`, plan `le-prix-d-un-panier.md`,
   * § 2.1) et lève le premier refus de lecture — à ce rang-ci de l'appelant
   * (§ 2.4, étape 4). `revised` : la commande qu'on révise — ses lignes
   * figées et ses remises de panier, REJOUÉES au lieu d'être rejugées (plan
   * des remises acquises, § 10.2) —, ou `null` à la passation.
   *
   * @throws {PickupClosedAtRequestedTimeError} la tranche ne tient dans aucune fenêtre du point.
   * @throws {AppError} tout autre refus de lecture (`loadedOrRefused`).
   */
  async load(request: PricingRequest): Promise<LoadedBasket> {
    return loadedOrRefused(await this.pricing.load(request));
  }

  /**
   * Les opérations datées, les réglages qui préremplissent et l'acheminement
   * convenu — APRÈS l'heure limite, dans cet ordre. `at` : l'instant du geste
   * (plan S2, R6), où se jugent les opérations datées ; les créneaux ne lisent
   * aucune horloge (`agreeWithWindow`, vérifié le 2026-11-10).
   */
  async arrange(
    content: OrderContent,
    parties: OrderParties,
    context: BasketPricingContext,
    requester: WindowRequester,
    at: Instant,
  ): Promise<ArrangedContent> {
    // Les deux gardes s'appliquent, c'est le plus tôt qui ferme, et l'équipe ne
    // rouvre pas une opération close (D6 du plan des opérations datées).
    await this.operations.ensure(
      content.lines,
      parties.companyId,
      content.requestedDeliveryDate,
      at,
    );
    const defaults = await this.defaultsFor(content, parties);
    const agreed = agreeWithWindow(
      {
        method: content.fulfillmentMethod,
        window: content.requestedWindow,
        contact: content.deliveryContact,
        signatureRequired: content.signatureRequired,
      },
      defaults,
      context.route.method === "delivery" ? context.route.globalWindowMode : null,
      requester,
    );
    return { agreed, bookAddressId: defaults.bookAddressId };
  }

  /**
   * Assemble la part composée de l'entrée de l'agrégat : l'acheminement figé
   * et convenu, et la demande de chiffrage — le panier chargé, le créneau
   * qu'une promotion juge, les verdicts qui ont un prix (§ 2.3).
   */
  static draftOf(
    content: OrderContent,
    context: BasketPricingContext,
    arranged: ArrangedContent,
    verdicts: BasketVerdicts,
  ): ComposedDraft {
    return {
      agreed: arranged.agreed,
      fulfillment: fulfillmentOf(content, context, arranged),
      requestedDeliveryDate: content.requestedDeliveryDate
        ? new Date(content.requestedDeliveryDate)
        : null,
      note: content.note,
      pricing: {
        context,
        // Le créneau choisi, que juge une promotion « au retrait » (plan jours
        // et heures, § 8.3) — en révision aussi, mais le rejeu y remplace la remise.
        handoverAt: handoverMomentOf(content.requestedDeliveryDate, content.requestedWindow),
        verdicts,
      },
    };
  }

  /**
   * Les réglages qui **préremplissent** cette commande — en coursier, ceux de
   * l'adresse du carnet ; en retrait et sans société, aucun (cf. l'historique
   * de cette règle dans `OrderDrafting`, d'où elle est extraite).
   */
  private async defaultsFor(
    content: OrderContent,
    parties: OrderParties,
  ): Promise<DeliveryDefaults> {
    if (
      content.fulfillmentMethod === "pickup" ||
      content.deliveryAddressId === null ||
      parties.companyId === null
    ) {
      return NO_DELIVERY_DEFAULTS;
    }
    return this.deliveryDefaults.of(
      content.deliveryAddressId,
      parties.companyId,
      content.requestedDeliveryDate,
    );
  }
}

/** Le site qui remet le point retenu, ou `null` en coursier — l'heure limite qui s'applique en dépend. */
export function pickupSiteOf(context: BasketPricingContext): string | null {
  return context.route.method === "pickup" ? (context.route.point.siteId ?? null) : null;
}

/**
 * L'acheminement à figer : le point ou la zone RÉSOLUS au chargement.
 *
 * 🔴 Jamais `content.deliveryAddressId` : celui-là vient du corps de la
 * requête. Seul l'identifiant relu sous le mur de la société est lié — une
 * adresse d'une autre maison retombe sur `null`, sans refus.
 */
function fulfillmentOf(
  content: OrderContent,
  context: BasketPricingContext,
  arranged: ArrangedContent,
): OrderFulfillmentInput {
  const { route } = context;
  const pickupAddress: PickupSnapshot | null = route.method === "pickup" ? route.point : null;
  return {
    method: content.fulfillmentMethod,
    deliveryZoneId: route.method === "delivery" ? route.zoneId : null,
    deliveryAddress: route.method === "delivery" ? route.address : null,
    deliveryAddressId: arranged.bookAddressId,
    pickupAddress,
  };
}

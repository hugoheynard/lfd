import type {
  OrderFulfillment as AgreedFulfillment,
  BillingAddressPayload,
  CartAdjustment,
  CustomerAudience,
  DeliveryVatMode,
  OrderLineInput as OrderLineRequest,
  PickupAddressView,
  PickupSnapshot,
  WindowMode,
} from "@lfd/contracts";
import { lineTotalCents } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import type { DraftOrderInput } from "../../domain/entities/order.js";
import type {
  DraftBasketDiscount,
  OrderDiscountLabel,
} from "../../domain/entities/order-shapes.js";
import {
  InvalidOrderFulfillmentError,
  PickupClosedAtRequestedTimeError,
} from "../../domain/errors/order-errors.js";
import {
  type DeliveryDefaults,
  DeliveryDefaultsReader,
  NO_DELIVERY_DEFAULTS,
} from "../../domain/ports/delivery-defaults.reader.js";
import { OrderDeliveryVatReader } from "../../domain/ports/order-delivery-vat.reader.js";
import {
  type OrderLineClassification,
  OrderLineClassificationReader,
} from "../../domain/ports/order-line-classification.reader.js";
import { windowFitsPickup } from "../../domain/services/agreed-fulfillment.js";
import {
  composeExactOrder,
  exactLineTtcsOf,
} from "../../domain/services/exact-order-composition.js";
import { agreeWithWindow, type WindowRequester } from "../../domain/services/delivery-window.js";
import {
  replayBasketDiscounts,
  type BasketDiscountRefusal,
  type ReplayedBasket,
} from "../../domain/services/basket-discount-replay.js";
import type {
  BasketLine,
  BasketPromotionOutcome,
} from "../../domain/services/basket-promotion-choice.js";
import { cumulatedDiscountsOf } from "../../domain/services/basket-promotion-plan.js";
import type { FrozenDiscountTerms } from "../../domain/services/frozen-discount-terms.js";
import type { KeptLineRefusal } from "../../domain/services/kept-line-prices.js";
import { quantityOf, type OrderLineInput } from "../../domain/value-objects/order-line.js";
import {
  placementVatMethodOf,
  type OrderVatMethod,
} from "../../domain/value-objects/order-vat-method.js";
import { CartAdjustments, type PickupBuyer } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderLinePricing } from "./order-line-pricing.service.js";
import { OrderOperations } from "./order-operations.service.js";
import type { OrderParties } from "./order-parties.js";
import { priceRevisedLines, type RevisedFrom, type RevisedLines } from "./revised-line-pricing.js";

/** Acheminement résolu : les snapshots à figer et les deux ajustements de prix. */
interface ResolvedFulfillment {
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: PickupSnapshot | null;
  readonly discountCents: number;
  /** L'ajustement figé qui l'a produite (taux/montant du point), ou `null`. */
  readonly discountAdjustment: CartAdjustment | null;
  /** Le libellé de la promotion panier pour l'acheteur, à figer (L8b) ; `null` sinon. */
  readonly discountLabel: OrderDiscountLabel | null;
  /** La promotion panier retenue, que la commande fige et que la révision compare (L9). */
  readonly discountPromotionId: string | null;
  /** Les SKU qu'aucune remise de panier ne couvre. */
  readonly ineligibleSkus: ReadonlySet<string>;
  /** Les remises cumulées (lot M7), à partir de deux ; `undefined` pour la remise unique ou aucune. */
  readonly basketDiscounts: readonly DraftBasketDiscount[] | undefined;
  /** Les termes figés de la remise unique (plan des remises acquises, § 10.3). */
  readonly discountTerms: FrozenDiscountTerms | null;
  /** Le barème de zone qui a produit les frais, ou `null` en retrait. */
  readonly deliveryFeeAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
  /** Le mode créneau / échéance global, ou `null` en retrait (CA-D2). */
  readonly globalWindowMode: WindowMode | null;
}

/**
 * Le panier tarifé et acheminé — la première moitié de la composition, celle
 * qui précède l'heure limite (l'ordre des refus en dépend, cf. `OrderDrafting`).
 */
export interface ResolvedContent {
  readonly lines: readonly OrderLineInput[];
  /** Le sous-total HT, arrondi au centime par ligne comme la ligne persistée. */
  readonly subtotalCents: number;
  readonly known: ReadonlyMap<string, OrderLineClassification>;
  readonly audience: CustomerAudience;
  readonly fulfillment: ResolvedFulfillment;
  /**
   * Ce que la révision ne laisse pas passer en silence — un prix de ligne qui
   * changerait, une remise qui tomberait sous son seuil (plan des remises
   * acquises, § 10.4) : le devis les rend, la révision lève le premier. Vide
   * à la passation.
   */
  readonly refusals: readonly RevisionPriceRefusal[];
}

/** Un refus de la règle « une modification ne change jamais un prix convenu en silence ». */
export type RevisionPriceRefusal = KeptLineRefusal | BasketDiscountRefusal;

/** Ce qui reste à décider après l'heure limite : l'acheminement convenu, le mode de TVA du port. */
export interface ArrangedContent {
  readonly agreed: AgreedFulfillment;
  readonly bookAddressId: string | null;
  readonly deliveryVatMode: DeliveryVatMode;
}

/**
 * La part de `DraftOrderInput` que la composition décide — tout sauf l'identité
 * de la commande (qui, pour qui, au nom de quelles CGV) et la surtaxe.
 */
export type ComposedDraft = Pick<
  DraftOrderInput,
  | "agreed"
  | "fulfillment"
  | "requestedDeliveryDate"
  | "note"
  | "lines"
  | "discountCents"
  | "discountAdjustment"
  | "discountLabel"
  | "discountPromotionId"
  | "discountTerms"
  | "basketDiscounts"
  | "deliveryFeeCents"
  | "deliveryFeeAdjustment"
  | "deliveryVatMode"
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
 */
@Injectable()
export class OrderComposition {
  constructor(
    private readonly linePricing: OrderLinePricing,
    private readonly adjustments: CartAdjustments,
    private readonly deliveryDefaults: DeliveryDefaultsReader,
    private readonly operations: OrderOperations,
    private readonly deliveryVat: OrderDeliveryVatReader,
    private readonly classifications: OrderLineClassificationReader,
    private readonly audiences: CustomerAudiences,
  ) {}

  /**
   * Tarife le panier, classe ses lignes, lit la clientèle et résout
   * l'acheminement. `revised` : la commande qu'on révise — ses lignes figées
   * et ses remises de panier, REJOUÉES au lieu d'être rejugées (plan des
   * remises acquises, § 10.2) —, ou `null` à la passation.
   *
   * @throws {PickupClosedAtRequestedTimeError} la tranche ne tient dans aucune fenêtre du point.
   */
  async resolve(
    content: OrderContent,
    parties: OrderParties,
    revised: RevisedFrom | null,
    vatMethod: OrderVatMethod = placementVatMethodOf(parties.companyId),
  ): Promise<ResolvedContent> {
    const { lines, refusals } = await this.priceLines(content.lines, parties, revised, vatMethod);
    // Les plans de remise se comparent dans l'unité de la commande (M7) :
    // en TTC pour `exact_ht`, par la composition même de l'agrégat.
    const ttcLines = vatMethod === "exact_ht" ? exactLineTtcsOf(lines) : null;
    // Le sous-total est un MONTANT : arrondi au centime, une fois par ligne,
    // par la même fonction que la ligne persistée. Deux arithmétiques ici
    // feraient diverger le seuil de franco du total facturé.
    const priced: readonly BasketLine[] = lines.map((line, index) => ({
      sku: line.sku,
      htCents: lineTotalCents(line.unitPriceMillicents, quantityOf(line)),
      quantity: quantityOf(line).amount,
      exact:
        ttcLines === null ? undefined : { ttcCents: ttcLines[index] ?? 0, vatRate: line.vatRate },
    }));
    // Produit et famille, lus UNE fois et figés sur chaque ligne : ce qui dira
    // demain pourquoi une ligne était exclue de la remise (plan des exclusions).
    const known = await this.classifications.classify(priced.map((line) => line.sku));
    // La clientèle, lue UNE fois : elle tarife l'acheminement et désigne les
    // CGV que la commande porte (plan des CGV, C2″, C4′).
    // Le statut d'où elle est tirée vient avec elle : les promotions panier
    // le lisent (plan des promotions, L5), sans seconde lecture.
    const { audience, companyStatus } = await this.audiences.standingOf(parties.companyId);
    const resolved = await this.resolveFulfillment(
      content,
      priced,
      { audience, companyId: parties.companyId, companyStatus, buyerKind: parties.buyerKind },
      known,
    );
    const replay =
      revised === null ? null : replayBasketDiscounts(revised.discounts, revised.lines, priced);
    const fulfillment = replay === null ? resolved : withReplayedDiscounts(resolved, replay);
    const subtotalCents = priced.reduce((sum, line) => sum + line.htCents, 0);
    return {
      lines,
      subtotalCents,
      known,
      audience,
      fulfillment,
      refusals: [...refusals, ...(replay?.refusals ?? [])],
    };
  }

  /**
   * Les opérations datées, les réglages qui préremplissent, le mode de TVA du
   * port et l'acheminement convenu — APRÈS l'heure limite, dans cet ordre.
   */
  async arrange(
    content: OrderContent,
    parties: OrderParties,
    resolved: ResolvedContent,
    requester: WindowRequester,
  ): Promise<ArrangedContent> {
    // Les deux gardes s'appliquent, c'est le plus tôt qui ferme, et l'équipe ne
    // rouvre pas une opération close (D6 du plan des opérations datées).
    await this.operations.ensure(content.lines, parties.companyId, content.requestedDeliveryDate);
    const defaults = await this.defaultsFor(content, parties);
    // Lu sur TOUTE passation, retrait compris : le mode se fige sur la commande
    // (V3), et `null` y est réservé aux commandes d'avant le réglage.
    const deliveryVatMode = await this.deliveryVat.current();
    const agreed = agreeWithWindow(
      {
        method: content.fulfillmentMethod,
        window: content.requestedWindow,
        contact: content.deliveryContact,
        signatureRequired: content.signatureRequired,
      },
      defaults,
      resolved.fulfillment.globalWindowMode,
      requester,
    );
    return { agreed, bookAddressId: defaults.bookAddressId, deliveryVatMode };
  }

  /**
   * Assemble la part composée de `DraftOrderInput`, **dans l'unité de la
   * méthode** de la commande (plan du centime, § 5) : HT pour `line_ht`, tels
   * que `CartAdjustments` les rend ; TTC pour `exact_ht`, par la composition
   * TTC que l'agrégat rejoue. `vatMethod` : décidée à la passation
   * (`placementVatMethodOf`), relue sur la commande en révision.
   */
  static draftOf(
    content: OrderContent,
    resolved: ResolvedContent,
    arranged: ArrangedContent,
    vatMethod: OrderVatMethod,
  ): ComposedDraft {
    const { fulfillment } = resolved;
    const lines = resolved.lines.map((line) =>
      classified(line, resolved.known, fulfillment.ineligibleSkus),
    );
    const cumulated = fulfillment.basketDiscounts;
    const amounts =
      vatMethod === "exact_ht"
        ? exactTermsOf(lines, fulfillment, cumulated, arranged.deliveryVatMode)
        : {
            discountCents: fulfillment.discountCents,
            deliveryFeeCents: fulfillment.deliveryFeeCents,
          };
    return {
      agreed: arranged.agreed,
      fulfillment: {
        method: content.fulfillmentMethod,
        deliveryZoneId: fulfillment.deliveryZoneId,
        deliveryAddress: fulfillment.deliveryAddress,
        // 🔴 Jamais `content.deliveryAddressId` : celui-là vient du corps de la
        // requête. Seul l'identifiant relu sous le mur de la société est lié —
        // une adresse d'une autre maison retombe sur `null`, sans refus.
        deliveryAddressId: arranged.bookAddressId,
        pickupAddress: fulfillment.pickupAddress,
      },
      requestedDeliveryDate: content.requestedDeliveryDate
        ? new Date(content.requestedDeliveryDate)
        : null,
      note: content.note,
      lines,
      discountCents: amounts.discountCents,
      discountAdjustment: fulfillment.discountAdjustment,
      discountLabel: fulfillment.discountLabel,
      discountPromotionId: fulfillment.discountPromotionId,
      discountTerms: fulfillment.discountTerms,
      ...(cumulated === undefined ? {} : { basketDiscounts: cumulated }),
      deliveryFeeAdjustment: fulfillment.deliveryFeeAdjustment,
      deliveryFeeCents: amounts.deliveryFeeCents,
      deliveryVatMode: arranged.deliveryVatMode,
    };
  }

  /**
   * Les lignes tarifées. À la passation, toutes passent par la résolution qui
   * facture ; en révision, {@link priceRevisedLines} — les lignes gardées à
   * leur prix figé, retarifées pour être comparées quand leur quantité change.
   */
  private async priceLines(
    requested: readonly OrderLineRequest[],
    parties: OrderParties,
    revised: RevisedFrom | null,
    vatMethod: OrderVatMethod,
  ): Promise<RevisedLines> {
    if (revised === null) {
      const resolved = await this.linePricing.resolve(requested, parties, "checkout");
      return { lines: resolved.map((entry) => entry.line), refusals: [] };
    }
    return priceRevisedLines(this.linePricing, requested, parties, revised, vatMethod);
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

  /**
   * Résout l'acheminement et ses deux ajustements (autoritaires, jamais envoyés
   * par le client). **Retrait** : snapshot du point (choisi ou défaut) + sa
   * remise. **Coursier** : adresse livrée figée + zone **déduite de son code
   * postal**, dont on tire le frais. Les deux pour la **clientèle** portée.
   *
   * @throws {PickupClosedForAudienceError} retrait sur un site fermé à la clientèle.
   * @throws {PickupChoiceRequiredError} aucun point choisi, et aucun ne s'impose.
   * @throws {DeliveryClosedForAudienceError} la livraison est fermée à la clientèle.
   */
  private async resolveFulfillment(
    content: OrderContent,
    priced: readonly BasketLine[],
    buyer: PickupBuyer,
    known: ReadonlyMap<string, OrderLineClassification>,
  ): Promise<ResolvedFulfillment> {
    if (content.fulfillmentMethod === "pickup") {
      // La remise vient du service PARTAGÉ avec le devis de la boutique.
      const retrait = await this.adjustments.forPickup(
        content.pickupAddressId,
        priced,
        buyer,
        known,
      );
      // La tranche doit tenir dans l'UNE des fenêtres du point — jamais dans
      // leur union : entre le créneau pro et l'ouverture publique il peut y
      // avoir porte close.
      if (!windowFitsPickup(content.requestedWindow ?? null, retrait.point.opening)) {
        throw new PickupClosedAtRequestedTimeError();
      }
      return {
        deliveryZoneId: null,
        deliveryAddress: null,
        pickupAddress: toSnapshot(retrait.point),
        discountCents: retrait.discountCents,
        discountAdjustment: retrait.discountAdjustment,
        discountLabel: retrait.discountLabel,
        discountPromotionId: retrait.promotionId,
        ...cumulatedOf(priced, retrait),
        deliveryFeeAdjustment: null,
        deliveryFeeCents: 0,
        globalWindowMode: null,
      };
    }
    // Coursier — le schéma garantit l'adresse ; on garde une défense typée.
    const address = content.deliveryAddress;
    if (address === null) {
      throw new InvalidOrderFulfillmentError("Adresse de livraison requise en coursier.");
    }
    const coursier = await this.adjustments.forDelivery(address.codePostal, priced, buyer, known);
    // La promotion « en livraison » (L10), servie par la même source que celle
    // du retrait — rien sous l'ancien chemin, où la livraison n'en ouvrait aucune.
    const { discount } = coursier;
    return {
      deliveryZoneId: coursier.zone.id,
      deliveryAddress: address,
      pickupAddress: null,
      discountCents: discount.discountCents,
      discountAdjustment: discount.discountAdjustment,
      discountLabel: discount.label,
      discountPromotionId: discount.promotionId,
      ...cumulatedOf(priced, discount),
      deliveryFeeCents: coursier.feeCents,
      // Le barème de la zone, figé avec son montant : `zone.fee` est mutable.
      deliveryFeeAdjustment: coursier.feeAdjustment,
      globalWindowMode: coursier.globalWindowMode,
    };
  }
}

/**
 * La remise retrait et le port d'une commande `exact_ht`, en TTC — par la
 * composition même que l'agrégat rejoue pour les vérifier. Le bon n'y entre
 * pas : il s'impute après la remise et ne change ni l'une ni l'autre.
 */
function exactTermsOf(
  lines: readonly OrderLineInput[],
  fulfillment: ResolvedFulfillment,
  cumulated: readonly DraftBasketDiscount[] | undefined,
  deliveryVatMode: DeliveryVatMode,
): { readonly discountCents: number; readonly deliveryFeeCents: number } {
  const composed = composeExactOrder({
    lines,
    discountAdjustment: fulfillment.discountAdjustment,
    ...(cumulated === undefined ? {} : { basketDiscounts: cumulated }),
    deliveryFeeAdjustment: fulfillment.deliveryFeeAdjustment,
    deliveryVatMode,
    voucherFaceCents: 0,
  });
  const discounted = fulfillment.discountAdjustment !== null || cumulated !== undefined;
  return {
    discountCents: discounted ? composed.pickupDiscount.ttcCents : 0,
    deliveryFeeCents:
      fulfillment.deliveryFeeAdjustment === null ? 0 : composed.deliveryFee.ttcCents,
  };
}

/**
 * Les remises que la caisse a retenues, dans la forme que l'agrégat reçoit :
 * cumulées à partir de deux (lot M7), sinon la remise unique et ses termes.
 */
function cumulatedOf(
  lines: readonly BasketLine[],
  outcome: Pick<BasketPromotionOutcome, "applied" | "ineligibleSkus">,
): Pick<ResolvedFulfillment, "ineligibleSkus" | "basketDiscounts" | "discountTerms"> {
  const [first] = outcome.applied;
  return {
    ineligibleSkus: outcome.ineligibleSkus,
    basketDiscounts: cumulatedDiscountsOf(lines, outcome.applied),
    discountTerms: outcome.applied.length === 1 && first !== undefined ? first.terms : null,
  };
}

/**
 * **La révision rejoue les remises de la commande** (plan des remises
 * acquises, § 10.2) : l'acheminement résolu garde son point, sa zone et ses
 * frais ; sa remise est remplacée par le rejeu, jamais par la caisse du
 * moment.
 */
function withReplayedDiscounts(
  resolved: ResolvedFulfillment,
  replay: ReplayedBasket,
): ResolvedFulfillment {
  return {
    ...resolved,
    discountCents: replay.discountCents,
    discountAdjustment: replay.discountAdjustment,
    discountLabel: replay.discountLabel,
    discountPromotionId: replay.discountPromotionId,
    discountTerms: replay.discountTerms,
    ineligibleSkus: replay.ineligibleSkus,
    basketDiscounts: replay.basketDiscounts,
  };
}

/**
 * Le point de retrait résolu, réduit à ses champs postaux — et à l'id du site
 * qui remet (lot S2). L'id est celui du point RÉSOLU.
 */
function toSnapshot(point: PickupAddressView): PickupSnapshot {
  return {
    siteId: point.id,
    label: point.label,
    ligne1: point.ligne1,
    ligne2: point.ligne2,
    codePostal: point.codePostal,
    ville: point.ville,
    pays: point.pays,
  };
}

/**
 * La ligne, avec ce qui se fige d'elle à la passation : son rangement au
 * catalogue et son éligibilité à la remise de retrait (R2 du plan des
 * exclusions), et son marqueur « sur mesure ».
 */
function classified(
  line: OrderLineInput,
  known: ReadonlyMap<string, OrderLineClassification>,
  ineligible: ReadonlySet<string>,
): OrderLineInput {
  const where = known.get(line.sku);
  return {
    ...line,
    pickupDiscountEligible: !ineligible.has(line.sku),
    productId: where?.productId ?? null,
    categoryId: where?.categoryId ?? null,
    madeToOrder: madeToOrderOf(line, where),
  };
}

/**
 * Le marqueur « sur mesure » à sceller (plan `plan-sur-mesure-partout.md`,
 * M1). Une ligne qui le porte déjà — une ligne gardée en révision — garde ce
 * qu'elle a scellé, `null` compris : même règle que son prix figé (R3). Une
 * ligne neuve lit le catalogue du jour ; un SKU qu'il ne range pas reste
 * `null`, « on ne savait pas », jamais un `false` inventé.
 */
function madeToOrderOf(
  line: OrderLineInput,
  where: OrderLineClassification | undefined,
): boolean | null {
  if (line.madeToOrder !== undefined) {
    return line.madeToOrder;
  }
  return where?.madeToOrder ?? null;
}

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
import { lineTotalCents, pieces } from "@lfd/money";
import { Injectable } from "@nestjs/common";

import type { DraftOrderInput } from "../../domain/entities/order.js";
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
import { composeExactOrder } from "../../domain/services/exact-order-composition.js";
import { agreeWithWindow, type WindowRequester } from "../../domain/services/delivery-window.js";
import type { PricedLine } from "../../domain/services/pickup-discount-eligibility.js";
import { revisedLineRequests } from "../../domain/services/revised-lines.js";
import type { OrderLineInput, OrderLineSnapshot } from "../../domain/value-objects/order-line.js";
import type { OrderVatMethod } from "../../domain/value-objects/order-vat-method.js";
import { CartAdjustments } from "./cart-adjustments.service.js";
import { CustomerAudiences } from "./customer-audiences.service.js";
import type { OrderContent } from "./order-content.js";
import { OrderLinePricing } from "./order-line-pricing.service.js";
import { OrderOperations } from "./order-operations.service.js";
import type { OrderParties } from "./order-parties.js";

/** Acheminement résolu : les snapshots à figer et les deux ajustements de prix. */
interface ResolvedFulfillment {
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: PickupSnapshot | null;
  readonly discountCents: number;
  /** L'ajustement figé qui l'a produite (taux/montant du point), ou `null`. */
  readonly discountAdjustment: CartAdjustment | null;
  /** Les SKU que la remise de retrait ne couvre pas — vide en coursier. */
  readonly ineligibleSkus: ReadonlySet<string>;
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
}

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
   * l'acheminement. `frozen` : les lignes de la révision précédente, ou `null`
   * à la passation.
   *
   * @throws {PickupClosedAtRequestedTimeError} la tranche ne tient dans aucune fenêtre du point.
   */
  async resolve(
    content: OrderContent,
    parties: OrderParties,
    frozen: readonly OrderLineSnapshot[] | null,
  ): Promise<ResolvedContent> {
    const lines = await this.priceLines(content.lines, parties, frozen);
    // Le sous-total est un MONTANT : arrondi au centime, une fois par ligne,
    // par la même fonction que la ligne persistée. Deux arithmétiques ici
    // feraient diverger le seuil de franco du total facturé.
    const priced: readonly PricedLine[] = lines.map((line) => ({
      sku: line.sku,
      htCents: lineTotalCents(line.unitPriceMillicents, pieces(line.quantity)),
    }));
    // Produit et famille, lus UNE fois et figés sur chaque ligne : ce qui dira
    // demain pourquoi une ligne était exclue de la remise (plan des exclusions).
    const known = await this.classifications.classify(priced.map((line) => line.sku));
    // La clientèle, lue UNE fois : elle tarife l'acheminement et désigne les
    // CGV que la commande porte (plan des CGV, C2″, C4′).
    const audience = await this.audiences.of(parties.companyId);
    const fulfillment = await this.resolveFulfillment(content, priced, audience, {
      companyId: parties.companyId,
      known,
    });
    const subtotalCents = priced.reduce((sum, line) => sum + line.htCents, 0);
    return { lines, subtotalCents, known, audience, fulfillment };
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
    const amounts =
      vatMethod === "exact_ht"
        ? exactTermsOf(lines, fulfillment, arranged.deliveryVatMode)
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
      deliveryFeeAdjustment: fulfillment.deliveryFeeAdjustment,
      deliveryFeeCents: amounts.deliveryFeeCents,
      deliveryVatMode: arranged.deliveryVatMode,
    };
  }

  /**
   * Les lignes tarifées. À la passation, toutes passent par la résolution qui
   * facture ; en révision, seules les NOUVELLES y passent — les autres
   * reprennent leur prix figé (R3), et un SKU retiré du catalogue depuis ne
   * fait donc pas refuser la quantité qu'on change.
   */
  private async priceLines(
    requested: readonly OrderLineRequest[],
    parties: OrderParties,
    frozen: readonly OrderLineSnapshot[] | null,
  ): Promise<readonly OrderLineInput[]> {
    if (frozen === null) {
      const resolved = await this.linePricing.resolve(requested, parties, "checkout");
      return resolved.map((entry) => entry.line);
    }
    const split = revisedLineRequests(frozen, requested);
    const fresh =
      split.fresh.length === 0
        ? []
        : await this.linePricing.resolve(split.fresh, parties, "checkout");
    const freshBySku = new Map(fresh.map((entry) => [entry.line.sku, entry.line]));
    return split.order.map((sku) => split.frozen.get(sku) ?? freshBySku.get(sku)).filter(isLine);
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
    priced: readonly PricedLine[],
    audience: CustomerAudience,
    {
      companyId,
      known,
    }: {
      readonly companyId: string | null;
      readonly known: ReadonlyMap<string, OrderLineClassification>;
    },
  ): Promise<ResolvedFulfillment> {
    if (content.fulfillmentMethod === "pickup") {
      // La remise vient du service PARTAGÉ avec le devis de la boutique.
      const retrait = await this.adjustments.forPickup(
        content.pickupAddressId,
        priced,
        audience,
        companyId,
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
        ineligibleSkus: retrait.ineligibleSkus,
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
    const subtotalCents = priced.reduce((sum, line) => sum + line.htCents, 0);
    const coursier = await this.adjustments.forDelivery(
      address.codePostal,
      subtotalCents,
      audience,
    );
    return {
      deliveryZoneId: coursier.zone.id,
      deliveryAddress: address,
      pickupAddress: null,
      // Le coursier n'ouvre droit à aucune remise : c'est le retrait qui en porte une.
      discountCents: 0,
      discountAdjustment: null,
      ineligibleSkus: new Set(),
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
  deliveryVatMode: DeliveryVatMode,
): { readonly discountCents: number; readonly deliveryFeeCents: number } {
  const composed = composeExactOrder({
    lines,
    discountAdjustment: fulfillment.discountAdjustment,
    deliveryFeeAdjustment: fulfillment.deliveryFeeAdjustment,
    deliveryVatMode,
    voucherFaceCents: 0,
  });
  return {
    discountCents: fulfillment.discountAdjustment === null ? 0 : composed.pickupDiscount.ttcCents,
    deliveryFeeCents:
      fulfillment.deliveryFeeAdjustment === null ? 0 : composed.deliveryFee.ttcCents,
  };
}

function isLine(line: OrderLineInput | undefined): line is OrderLineInput {
  return line !== undefined;
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
 * La ligne, avec ce qui se fige d'elle pour la remise de retrait : son
 * rangement au catalogue et son éligibilité (R2 du plan des exclusions).
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
  };
}

import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type PickupAddressView,
} from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DeliveryZoneRepository } from "../../../delivery-zones/domain/delivery-zone.repository.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import {
  EmptyOrderError,
  PickupNotConfiguredError,
  UnknownDeliveryZoneError,
  UnknownSkuError,
} from "../../domain/errors/order-errors.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository, type OrderLineToPersist } from "../../domain/ports/order.repository.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import { computeVatCents } from "../../domain/services/vat.js";
import { PlaceOrderCommand, type PlaceOrderResult } from "./place-order.command.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/** Acheminement résolu : les snapshots à figer et les deux ajustements de prix. */
interface ResolvedFulfillment {
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
  readonly discountCents: number;
  readonly deliveryFeeCents: number;
}

/**
 * Passe une commande — **zéro friction** :
 * - mur **membre** SEULEMENT si une entreprise est visée (sinon la commande est
 *   personnelle, murée par le seul client connecté) ;
 * - **ré-résolution serveur** des prix (le client n'envoie que sku + quantité) et
 *   du **frais de la zone** coursier (depuis son `id`, autorité) ;
 * - **règlement** : carte (`per_order`) sauf pour une entreprise **active** à
 *   terme différé (net/mensuel), auquel cas c'est facturé hors ligne (`not_required`).
 *
 * Pour une carte, l'intention Stripe est créée AVANT la commande : une commande
 * `pending` porte toujours son intent (pas de fenêtre orpheline) ; si Stripe
 * échoue, aucune commande n'est créée.
 */
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand, PlaceOrderResult> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly catalog: ProductCatalogReader,
    private readonly orders: OrderRepository,
    private readonly pickups: PickupAddressRepository,
    private readonly zones: DeliveryZoneRepository,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<PlaceOrderResult> {
    const { payload } = command;
    const { companyId } = payload;

    // Mur : rattachée à une entreprise ⇒ il faut en être membre. Personnelle ⇒
    // seul le client connecté la possède, rien à vérifier.
    if (companyId !== null) {
      const role = await this.guard.roleOf(command.actorUserId, companyId);
      ensureOrderMember(role, companyId);
    }

    const lines = this.resolveLines(payload.lines);
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

    const acheminement = await this.resolveFulfillment(payload, subtotalCents);

    // TVA par taux (prix HT) : marchandises (remise déduite au prorata) + livraison.
    // `totalCents` est donc le **TTC** — c'est lui qu'on encaisse (carte Stripe).
    const vatCents = computeVatCents({
      lines: lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: line.vatRate })),
      discountCents: acheminement.discountCents,
      deliveryFeeCents: acheminement.deliveryFeeCents,
    });
    const netHtCents =
      Math.max(0, subtotalCents - acheminement.discountCents) + acheminement.deliveryFeeCents;
    const totalCents = netHtCents + vatCents;

    const requiresCard = (await this.requiresCard(companyId)) && totalCents > 0;
    const intent = requiresCard
      ? await this.payments.createIntent({ amountCents: totalCents, currency: CURRENCY, companyId })
      : null;

    const placed = await this.orders.place({
      companyId,
      placedByUserId: command.actorUserId,
      fulfillmentMethod: payload.fulfillmentMethod,
      deliveryZoneId: acheminement.deliveryZoneId,
      deliveryAddress: acheminement.deliveryAddress,
      pickupAddress: acheminement.pickupAddress,
      requestedDeliveryDate: payload.requestedDeliveryDate
        ? new Date(payload.requestedDeliveryDate)
        : null,
      note: payload.note,
      subtotalCents,
      discountCents: acheminement.discountCents,
      deliveryFeeCents: acheminement.deliveryFeeCents,
      vatCents,
      totalCents,
      paymentStatus: requiresCard ? "pending" : "not_required",
      stripePaymentIntentId: intent?.paymentIntentId ?? null,
      lines,
    });

    if (intent === null) {
      return { id: placed.id, orderNumber: placed.orderNumber };
    }
    return {
      id: placed.id,
      orderNumber: placed.orderNumber,
      payment: {
        clientSecret: intent.clientSecret,
        publishableKey: this.payments.publishableKey(),
        amountCents: totalCents,
      },
    };
  }

  /**
   * Une carte est requise sauf pour une entreprise **active** à terme **différé**
   * (net/mensuel), facturée hors ligne. Sans entreprise, ou entreprise non active /
   * `per_order` → carte.
   */
  private async requiresCard(companyId: string | null): Promise<boolean> {
    if (companyId === null) {
      return true;
    }
    const status = await this.guard.companyStatusOf(companyId);
    if (status !== "active") {
      return true;
    }
    const term = await this.guard.paymentTermOf(companyId);
    return term === null || term === "per_order";
  }

  /**
   * Résout l'acheminement et ses deux ajustements (autoritaires, jamais envoyés
   * par le client). **Retrait** : snapshot du point (choisi ou défaut) + sa remise.
   * **Coursier** : adresse libre figée + frais **re-résolu** depuis la zone choisie.
   */
  private async resolveFulfillment(
    payload: PlaceOrderCommand["payload"],
    subtotalCents: number,
  ): Promise<ResolvedFulfillment> {
    if (payload.fulfillmentMethod === "pickup") {
      const point = await this.pickups.resolve(payload.pickupAddressId);
      if (point === null) {
        throw new PickupNotConfiguredError();
      }
      return {
        deliveryZoneId: null,
        deliveryAddress: null,
        pickupAddress: toSnapshot(point),
        discountCents: point.discount ? cartAdjustmentCents(point.discount, subtotalCents) : 0,
        deliveryFeeCents: 0,
      };
    }

    // Coursier — le schéma garantit zone + adresse ; on garde une défense typée.
    const zoneId = payload.deliveryZoneId;
    if (zoneId === null || payload.deliveryAddress === null) {
      throw new UnknownDeliveryZoneError(zoneId ?? "");
    }
    const zone = await this.zones.findById(zoneId);
    if (zone === null) {
      throw new UnknownDeliveryZoneError(zoneId);
    }
    return {
      deliveryZoneId: zoneId,
      deliveryAddress: payload.deliveryAddress,
      pickupAddress: null,
      discountCents: 0,
      deliveryFeeCents: cartAdjustmentCents(zone.fee, subtotalCents),
    };
  }

  /**
   * Fusionne les lignes par SKU (quantités additionnées) puis résout chacune au
   * catalogue — c'est ici que le prix devient autoritaire, jamais celui du client.
   */
  private resolveLines(
    input: readonly { readonly sku: string; readonly quantity: number }[],
  ): OrderLineToPersist[] {
    const quantities = new Map<string, number>();
    for (const line of input) {
      quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
    }
    if (quantities.size === 0) {
      throw new EmptyOrderError();
    }
    return [...quantities].map(([sku, quantity]) => {
      const item = this.catalog.resolve(sku);
      if (item === null) {
        throw new UnknownSkuError(sku);
      }
      return {
        sku: item.sku,
        productName: item.name,
        unitPriceCents: item.unitPriceCents,
        vatRate: item.vatRate,
        quantity,
        lineTotalCents: item.unitPriceCents * quantity,
      };
    });
  }
}

/** Le point de retrait résolu, réduit à ses champs postaux (le snapshot figé). */
function toSnapshot(point: PickupAddressView): BillingAddressPayload {
  return {
    label: point.label,
    ligne1: point.ligne1,
    ligne2: point.ligne2,
    codePostal: point.codePostal,
    ville: point.ville,
    pays: point.pays,
  };
}

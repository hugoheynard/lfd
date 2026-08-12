import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type CartAdjustment,
  type PickupAddressView,
} from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DeliveryZoneRepository } from "../../../delivery-zones/domain/delivery-zone.repository.js";
import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { PaymentGateway } from "../../../payments/domain/payment-gateway.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { Order } from "../../domain/entities/order.js";
import {
  InvalidOrderFulfillmentError,
  NoDeliveryZoneForPostalCodeError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../domain/errors/order-errors.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { ensureOrderMember } from "../../domain/services/order-access.js";
import type { OrderLineInput } from "../../domain/value-objects/order-line.js";
import { PlaceOrderCommand, type PlaceOrderResult } from "./place-order.command.js";

/** Devise unique de la plateforme (montants en centimes d'euro). */
const CURRENCY = "eur";

/** Acheminement résolu : les snapshots à figer et les deux ajustements de prix. */
interface ResolvedFulfillment {
  readonly deliveryZoneId: string | null;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddress: BillingAddressPayload | null;
  readonly discountCents: number;
  /** L'ajustement figé qui l'a produite (taux/montant du point), ou `null`. */
  readonly discountAdjustment: CartAdjustment | null;
  readonly deliveryFeeCents: number;
}

/**
 * Passe une commande — **zéro friction**. Le handler **orchestre** (mur, catalogue,
 * acheminement, décision carte/différé, Stripe) ; le **calcul monétaire et les
 * invariants** vivent dans l'agrégat `Order` :
 * - mur **membre** SEULEMENT si une entreprise est visée (sinon personnelle) ;
 * - **ré-résolution serveur** des prix (sku + qté) et du **frais de zone** ;
 * - l'agrégat `draft()` calcule sous-total/TVA/total ; on décide ensuite le
 *   règlement (`payByCard` si carte requise et total > 0, sinon `deferPayment`).
 *
 * Pour une carte, l'intention Stripe est créée AVANT la persistance, dimensionnée
 * sur `order.totalCents` : une commande `pending` porte toujours son intent.
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
    private readonly events: DomainEventPublisher,
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
    const subtotalCents = lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
    const acheminement = await this.resolveFulfillment(payload, subtotalCents);

    // L'agrégat calcule sous-total / TVA / total (TTC) et porte les invariants.
    const order = Order.draft({
      companyId,
      placedByUserId: command.actorUserId,
      fulfillment: {
        method: payload.fulfillmentMethod,
        deliveryZoneId: acheminement.deliveryZoneId,
        deliveryAddress: acheminement.deliveryAddress,
        pickupAddress: acheminement.pickupAddress,
      },
      requestedDeliveryDate: payload.requestedDeliveryDate
        ? new Date(payload.requestedDeliveryDate)
        : null,
      note: payload.note,
      lines,
      discountCents: acheminement.discountCents,
      discountAdjustment: acheminement.discountAdjustment,
      deliveryFeeCents: acheminement.deliveryFeeCents,
    });

    const intent = await this.settle(order, companyId);
    const placed = await this.orders.place(order);

    // Fait de domaine, publié APRÈS persistance (on ne journalise pas une commande
    // qui n'a pas pris). Le journal croissance écoute ; l'échec d'un abonné ne
    // remonte pas ici (le recorder est best-effort).
    this.events.publish(
      new OrderPlacedEvent(
        placed.id,
        placed.orderNumber,
        command.actorUserId,
        companyId,
        order.totalCents,
      ),
    );

    if (intent === null) {
      return { id: placed.id, orderNumber: placed.orderNumber };
    }
    return {
      id: placed.id,
      orderNumber: placed.orderNumber,
      payment: {
        clientSecret: intent.clientSecret,
        publishableKey: this.payments.publishableKey(),
        amountCents: order.totalCents,
      },
    };
  }

  /**
   * Décide le règlement de l'agrégat et crée l'intention Stripe si une carte est
   * requise (total > 0). Renvoie l'intention (pour le `clientSecret`) ou `null`
   * (différé / gratuit). L'intention est dimensionnée sur `order.totalCents`.
   */
  private async settle(
    order: Order,
    companyId: string | null,
  ): Promise<{ clientSecret: string } | null> {
    const requiresCard = (await this.requiresCard(companyId)) && order.totalCents > 0;
    if (!requiresCard) {
      order.deferPayment();
      return null;
    }
    const intent = await this.payments.createIntent({
      amountCents: order.totalCents,
      currency: CURRENCY,
      companyId,
    });
    order.payByCard(intent.paymentIntentId);
    return { clientSecret: intent.clientSecret };
  }

  /**
   * Une carte est requise, sauf pour une entreprise **active** à qui un crédit a
   * été accordé — sa commande part alors au compte, facturée au terme.
   *
   * Sans entreprise, ou entreprise non activée : carte. Le crédit se négocie
   * avec une société cliente, pas avec un panier.
   */
  private async requiresCard(companyId: string | null): Promise<boolean> {
    if (companyId === null) {
      return true;
    }
    const status = await this.guard.companyStatusOf(companyId);
    if (status !== "active") {
      return true;
    }
    return !(await this.guard.settlesOnAccount(companyId));
  }

  /**
   * Résout l'acheminement et ses deux ajustements (autoritaires, jamais envoyés
   * par le client). **Retrait** : snapshot du point (choisi ou défaut) + sa remise.
   * **Coursier** : adresse livrée figée + zone **déduite de son code postal**,
   * dont on tire le frais.
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
        discountAdjustment: point.discount,
        deliveryFeeCents: 0,
      };
    }

    // Coursier — le schéma garantit l'adresse ; on garde une défense typée.
    const address = payload.deliveryAddress;
    if (address === null) {
      throw new InvalidOrderFulfillmentError("Adresse de livraison requise en coursier.");
    }
    // La zone se DÉDUIT du code postal livré : c'est une propriété de l'adresse,
    // pas un choix. Personne ne peut donc annoncer un secteur moins cher que le sien.
    const zone = await this.zones.resolveForPostalCode(address.codePostal);
    if (zone === null) {
      throw new NoDeliveryZoneForPostalCodeError(address.codePostal);
    }
    return {
      deliveryZoneId: zone.id,
      deliveryAddress: address,
      pickupAddress: null,
      discountCents: 0,
      // Le coursier n'ouvre droit à aucune remise : c'est le retrait qui en porte une.
      discountAdjustment: null,
      deliveryFeeCents: cartAdjustmentCents(zone.fee, subtotalCents),
    };
  }

  /**
   * Fusionne les lignes par SKU (quantités additionnées) puis résout chacune au
   * catalogue — c'est ici que le prix devient autoritaire, jamais celui du client.
   */
  private resolveLines(
    input: readonly { readonly sku: string; readonly quantity: number }[],
  ): OrderLineInput[] {
    const quantities = new Map<string, number>();
    for (const line of input) {
      quantities.set(line.sku, (quantities.get(line.sku) ?? 0) + line.quantity);
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

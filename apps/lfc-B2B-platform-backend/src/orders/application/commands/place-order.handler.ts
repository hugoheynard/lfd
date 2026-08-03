import {
  cartAdjustmentCents,
  type BillingAddressPayload,
  type CartAdjustment,
  type PickupAddressView,
} from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DeliveryZoneRepository } from "../../../delivery-zones/domain/delivery-zone.repository.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import {
  EmptyOrderError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../domain/errors/order-errors.js";
import { DeliveryAddressReader } from "../../domain/ports/delivery-address.reader.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import {
  OrderRepository,
  type OrderLineToPersist,
  type PlacedOrder,
} from "../../domain/ports/order.repository.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { ensureCanOrder, ensureOrderMember } from "../../domain/services/order-access.js";
import { PlaceOrderCommand } from "./place-order.command.js";

/**
 * Passe une commande : mur (membre) → droit de commander (entreprise activée) →
 * **ré-résolution serveur** des prix (le client n'a envoyé que sku + quantité) →
 * écriture transactionnelle. Les lignes en double sont fusionnées par SKU.
 */
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand, PlacedOrder> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly catalog: ProductCatalogReader,
    private readonly orders: OrderRepository,
    private readonly pickups: PickupAddressRepository,
    private readonly zones: DeliveryZoneRepository,
    private readonly deliveryAddresses: DeliveryAddressReader,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<PlacedOrder> {
    const role = await this.guard.roleOf(command.actorUserId, command.companyId);
    ensureOrderMember(role, command.companyId);

    const status = await this.guard.companyStatusOf(command.companyId);
    ensureCanOrder(status, command.companyId);

    const acheminement = await this.resolveFulfillment(command);
    const lines = this.resolveLines(command.payload.lines);
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

    // Prix ré-résolus serveur : la remise (retrait) et le frais (zone livraison)
    // sont **autoritaires**, calculés ici, jamais envoyés par le client.
    const discountCents = acheminement.discount
      ? cartAdjustmentCents(acheminement.discount, subtotalCents)
      : 0;
    const deliveryFeeCents = await this.resolveDeliveryFee(command, acheminement, subtotalCents);
    const totalCents = Math.max(0, subtotalCents - discountCents) + deliveryFeeCents;

    return this.orders.place({
      companyId: command.companyId,
      placedByUserId: command.actorUserId,
      fulfillmentMethod: command.payload.fulfillmentMethod,
      deliveryAddressId: acheminement.deliveryAddressId,
      pickupAddress: acheminement.pickupAddress,
      requestedDeliveryDate: command.payload.requestedDeliveryDate
        ? new Date(command.payload.requestedDeliveryDate)
        : null,
      note: command.payload.note,
      subtotalCents,
      discountCents,
      deliveryFeeCents,
      totalCents,
      lines,
    });
  }

  /**
   * Résout l'acheminement. En **retrait**, on **fige** un snapshot du point de
   * retrait **choisi** (ou du défaut) — sinon `PickupNotConfiguredError` (aucun
   * point) — et on remonte sa **remise**. En **livraison**, l'`addressId` du
   * payload (le schéma garantit sa présence) ; son appartenance à l'entreprise est
   * vérifiée dans la transaction.
   */
  private async resolveFulfillment(command: PlaceOrderCommand): Promise<{
    readonly deliveryAddressId: string | null;
    readonly pickupAddress: BillingAddressPayload | null;
    readonly discount: CartAdjustment | null;
  }> {
    if (command.payload.fulfillmentMethod === "pickup") {
      const point = await this.pickups.resolve(command.payload.pickupAddressId);
      if (point === null) {
        throw new PickupNotConfiguredError();
      }
      return {
        deliveryAddressId: null,
        pickupAddress: toSnapshot(point),
        discount: point.discount,
      };
    }
    return {
      deliveryAddressId: command.payload.deliveryAddressId,
      pickupAddress: null,
      discount: null,
    };
  }

  /**
   * Frais de livraison de la **zone** du code postal livré, ou `0` (retrait, pas
   * d'adresse, ou aucune zone pour ce code postal). Le code postal est ré-lu
   * serveur depuis l'adresse de l'entreprise (jamais envoyé par le client).
   */
  private async resolveDeliveryFee(
    command: PlaceOrderCommand,
    acheminement: { readonly deliveryAddressId: string | null },
    subtotalCents: number,
  ): Promise<number> {
    if (
      command.payload.fulfillmentMethod !== "delivery" ||
      acheminement.deliveryAddressId === null
    ) {
      return 0;
    }
    const postalCode = await this.deliveryAddresses.postalCodeOf(
      command.companyId,
      acheminement.deliveryAddressId,
    );
    if (postalCode === null) {
      return 0;
    }
    const zone = await this.zones.findByPostalCode(postalCode);
    return zone === null ? 0 : cartAdjustmentCents(zone.fee, subtotalCents);
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

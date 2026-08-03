import type { BillingAddressPayload } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PlatformSettingsRepository } from "../../../platform-settings/domain/platform-settings.repository.js";
import {
  EmptyOrderError,
  PickupNotConfiguredError,
  UnknownSkuError,
} from "../../domain/errors/order-errors.js";
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
    private readonly settings: PlatformSettingsRepository,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<PlacedOrder> {
    const role = await this.guard.roleOf(command.actorUserId, command.companyId);
    ensureOrderMember(role, command.companyId);

    const status = await this.guard.companyStatusOf(command.companyId);
    ensureCanOrder(status, command.companyId);

    const acheminement = await this.resolveFulfillment(command);
    const lines = this.resolveLines(command.payload.lines);
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

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
      // Phase 1 : pas de frais ni remise, prix TTC — total = sous-total.
      totalCents: subtotalCents,
      lines,
    });
  }

  /**
   * Résout l'acheminement. En **retrait**, on **fige** l'adresse du point de retrait
   * du moment (Réglages) — sinon `PickupNotConfiguredError` (aucun point configuré).
   * En **livraison**, l'`addressId` du payload (le schéma garantit sa présence) ;
   * son appartenance à l'entreprise est vérifiée dans la transaction du repository.
   */
  private async resolveFulfillment(command: PlaceOrderCommand): Promise<{
    readonly deliveryAddressId: string | null;
    readonly pickupAddress: BillingAddressPayload | null;
  }> {
    if (command.payload.fulfillmentMethod === "pickup") {
      const pickup = (await this.settings.read()).pickupAddress;
      if (pickup === null) {
        throw new PickupNotConfiguredError();
      }
      return { deliveryAddressId: null, pickupAddress: pickup };
    }
    return { deliveryAddressId: command.payload.deliveryAddressId, pickupAddress: null };
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

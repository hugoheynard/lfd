import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { EmptyOrderError, UnknownSkuError } from "../../domain/errors/order-errors.js";
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
  ) {}

  async execute(command: PlaceOrderCommand): Promise<PlacedOrder> {
    const role = await this.guard.roleOf(command.actorUserId, command.companyId);
    ensureOrderMember(role, command.companyId);

    const status = await this.guard.companyStatusOf(command.companyId);
    ensureCanOrder(status, command.companyId);

    const lines = this.resolveLines(command.payload.lines);
    const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);

    return this.orders.place({
      companyId: command.companyId,
      placedByUserId: command.actorUserId,
      deliveryAddressId: command.payload.deliveryAddressId,
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

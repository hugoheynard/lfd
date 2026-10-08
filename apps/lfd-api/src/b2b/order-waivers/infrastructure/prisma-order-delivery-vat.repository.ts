import { deliveryVatModeSchema, type DeliveryVatMode } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderDeliveryVatReader } from "../../orders/domain/ports/order-delivery-vat.reader.js";
import { DEFAULT_DELIVERY_VAT_MODE } from "../domain/order-delivery-vat.defaults.js";
import { OrderDeliveryVatRepository } from "../domain/order-delivery-vat.repository.js";

/** La clé unique de la ligne de réglage — la même vérité que le `CHECK` de la migration. */
const SINGLETON = "singleton";

@Injectable()
export class PrismaOrderDeliveryVatRepository extends OrderDeliveryVatRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<DeliveryVatMode | null> {
    const row = await this.prisma.orderDeliveryVat.findUnique({ where: { id: SINGLETON } });
    // Validé et non casté : la colonne est un TEXT tenu par un CHECK, et le
    // schéma refuse ce qu'il ne connaît pas plutôt que de le facturer.
    return row === null ? null : deliveryVatModeSchema.parse(row.mode);
  }

  async save(mode: DeliveryVatMode, updatedBy: string): Promise<void> {
    await this.prisma.orderDeliveryVat.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, mode, updatedBy },
      update: { mode, updatedBy },
    });
  }
}

/**
 * Le même adaptateur, vu par la **passation** et le devis : le mode courant,
 * repli compris. Le repli vit ici parce qu'un DEFAULT de colonne ne joue pas
 * sur une ligne absente.
 */
@Injectable()
export class PrismaOrderDeliveryVatReader extends OrderDeliveryVatReader {
  constructor(private readonly repository: OrderDeliveryVatRepository) {
    super();
  }

  async current(): Promise<DeliveryVatMode> {
    return (await this.repository.read()) ?? DEFAULT_DELIVERY_VAT_MODE;
  }
}

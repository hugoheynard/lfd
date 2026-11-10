import { type AddressDoorstepRuleView, doorstepRuleSchema } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AddressKind } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DeliveryDoorstepRuleReader } from "../domain/ports/delivery-doorstep-rule.reader.js";

/** Adaptateur Prisma : une ligne, sous le mur de la société. */
@Injectable()
export class PrismaDeliveryDoorstepRuleReader extends DeliveryDoorstepRuleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ruleOf(companyId: string, addressId: string): Promise<AddressDoorstepRuleView | null> {
    const row = await this.prisma.address.findFirst({
      where: { id: addressId, companyId, kind: AddressKind.delivery, archivedAt: null },
      select: { doorstepRule: true },
    });
    if (row === null) {
      return null;
    }
    // Un CHECK tient la valeur en base : une autre lève plutôt que d'être devinée.
    return {
      rule: row.doorstepRule === null ? null : doorstepRuleSchema.parse(row.doorstepRule),
    };
  }
}

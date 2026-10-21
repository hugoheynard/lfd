import type { OrderCutoffView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StoredOrderCutoffReader } from "../domain/stored-order-cutoff.reader.js";
import { GENERAL_ORDER_CUTOFF_WHERE } from "./general-order-cutoff.row.js";

/** La lecture de la règle générale dans `public.order_cutoffs`. */
@Injectable()
export class PrismaStoredOrderCutoffReader extends StoredOrderCutoffReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async general(): Promise<OrderCutoffView | null> {
    const row = await this.prisma.orderCutoff.findFirst({ where: GENERAL_ORDER_CUTOFF_WHERE });
    return row === null
      ? null
      : {
          id: row.id,
          pickupAddressId: null,
          pickupLabel: null,
          weekday: null,
          daysBefore: row.daysBefore,
          time: row.time,
          graceMinutes: row.graceMinutes,
        };
  }
}

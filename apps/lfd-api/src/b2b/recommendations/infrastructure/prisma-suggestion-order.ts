import {
  DEFAULT_STAFF_SUGGESTION_ORDER,
  STAFF_SUGGESTION_ORDERS,
  type StaffSuggestionOrder,
  type StaffSuggestionOrderView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { WriteStamp } from "../domain/entities/staff-suggestion-rule.js";
import { SuggestionOrderReader } from "../domain/ports/suggestion-order.reader.js";
import { SuggestionOrderWriter } from "../domain/ports/suggestion-order.writer.js";

/** La clé NATURELLE de l'unique ligne du réglage (précédent `order_opening_settings`). */
const ORDER_SETTING_KEY = "suggestions";

/**
 * Le réglage de l'ordre, lu. **Ligne absente = `recent`**, sans semis : une
 * base neuve ou remise à zéro sert la plus récente d'abord.
 */
@Injectable()
export class PrismaSuggestionOrderReader extends SuggestionOrderReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<StaffSuggestionOrderView> {
    const row = await this.prisma.staffSuggestionOrderSetting.findUnique({
      where: { key: ORDER_SETTING_KEY },
    });
    // Le CHECK en base tient l'énumération ; une valeur inconnue ne se rend pas.
    const order = STAFF_SUGGESTION_ORDERS.find((known) => known === row?.order);
    return row === null || order === undefined
      ? { order: DEFAULT_STAFF_SUGGESTION_ORDER, updatedAt: null }
      : { order, updatedAt: row.updatedAt.toISOString() };
  }
}

/** Le réglage de l'ordre, écrit : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaSuggestionOrderWriter extends SuggestionOrderWriter {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(order: StaffSuggestionOrder, stamp: WriteStamp): Promise<void> {
    const row = { order, updatedAt: stamp.at, updatedBy: stamp.by };
    await this.prisma.staffSuggestionOrderSetting.upsert({
      where: { key: ORDER_SETTING_KEY },
      create: { key: ORDER_SETTING_KEY, ...row },
      update: row,
    });
  }
}

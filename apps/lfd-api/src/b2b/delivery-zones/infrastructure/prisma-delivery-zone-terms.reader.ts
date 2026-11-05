import type { AdminDeliveryZoneView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { fromAdjustmentColumns } from "../../pricing/cart-adjustment.mapper.js";
import { DeliveryZoneTermsReader } from "../domain/ports/delivery-zone-terms.reader.js";
import { DELIVERY_PRICING_COLUMNS, termsFromColumns } from "./delivery-pricing.columns.js";

/** Adaptateur Prisma des zones lues avec leurs remplacements par audience. */
@Injectable()
export class PrismaDeliveryZoneTermsReader extends DeliveryZoneTermsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly AdminDeliveryZoneView[]> {
    const rows = await this.prisma.deliveryZone.findMany({
      orderBy: { label: "asc" },
      select: {
        id: true,
        postalPrefixes: true,
        label: true,
        feeMode: true,
        feeValue: true,
        ...DELIVERY_PRICING_COLUMNS,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      postalPrefixes: row.postalPrefixes,
      label: row.label,
      // `feeMode`/`feeValue` sont non-null en base (colonnes requises) → jamais `null`.
      fee: fromAdjustmentColumns(row.feeMode, row.feeValue) ?? { mode: "amount", cents: 0 },
      audienceTerms: termsFromColumns(row),
    }));
  }
}

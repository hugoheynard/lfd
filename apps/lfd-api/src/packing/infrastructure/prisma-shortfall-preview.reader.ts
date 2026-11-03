import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type PackingShortfallPreview,
  ShortfallPreviewReader,
} from "../channels/commerce/shortfall-preview.reader.js";
import { latestServiceDayOf, loadPackingSheet } from "./packing-sheet.load.js";

/**
 * L'aperçu du bac par le client routé, sans verrou (C1b, 2026-11-03) : la
 * feuille la plus récente de l'envoi, la règle de l'agrégat.
 */
@Injectable()
export class PrismaShortfallPreviewReader extends ShortfallPreviewReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async previewOf(orderId: string, rank: number): Promise<PackingShortfallPreview> {
    const day = await latestServiceDayOf(this.prisma, orderId, rank);
    const sheet = day === null ? null : await loadPackingSheet(this.prisma, day, orderId, rank);
    if (sheet === null) {
      return { kind: "refused", refusal: "not_drawn" };
    }
    const standing = sheet.shortfallStanding;
    if (standing.kind === "refused") {
      return standing;
    }
    return {
      kind: "short",
      lines: standing.lines.map((line) => ({
        sku: line.sku,
        productName: line.productName,
        saleUnit: line.saleUnit,
        due: line.due,
        packed: line.packed,
      })),
    };
  }
}

import { Injectable } from "@nestjs/common";

import { OrderPrintColorsReader } from "../../../production/channels/commerce/index.js";
import { PrismaOrderPrintColors } from "./prisma-order-print-colors.reader.js";

/** L'adaptateur d'`OrderPrintColorsReader` (fournil) : la lecture du commerce, telle quelle. */
@Injectable()
export class ProductionOrderPrintColorsReader extends OrderPrintColorsReader {
  constructor(private readonly colors: PrismaOrderPrintColors) {
    super();
  }

  colorsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.colors.colorsOf(orderIds);
  }
}

import { Injectable } from "@nestjs/common";

import { BinLabelColorsReader } from "../../../delivery/channels/commerce/index.js";
import { PrismaOrderPrintColors } from "./prisma-order-print-colors.reader.js";

/** L'adaptateur de `BinLabelColorsReader` (livraison) : la règle du bon, pour une commande. */
@Injectable()
export class DeliveryBinLabelColorsReader extends BinLabelColorsReader {
  constructor(private readonly colors: PrismaOrderPrintColors) {
    super();
  }

  async colorOf(orderId: string): Promise<string | null> {
    return (await this.colors.colorsOf([orderId])).get(orderId) ?? null;
  }
}

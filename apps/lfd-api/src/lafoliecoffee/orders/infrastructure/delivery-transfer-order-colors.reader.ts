import { Injectable } from "@nestjs/common";

import { TransferOrderColorsReader } from "../../../delivery/channels/commerce/index.js";
import { PrismaOrderPrintColors } from "./prisma-order-print-colors.reader.js";

/** L'adaptateur de `TransferOrderColorsReader` (livraison) : la lecture du commerce, telle quelle. */
@Injectable()
export class DeliveryTransferOrderColorsReader extends TransferOrderColorsReader {
  constructor(private readonly colors: PrismaOrderPrintColors) {
    super();
  }

  colorsOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return this.colors.colorsOf(orderIds);
  }
}

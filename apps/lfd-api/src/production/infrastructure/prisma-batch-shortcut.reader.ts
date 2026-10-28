import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  BatchShortcutReader,
  type StoredBatchShortcut,
} from "../domain/ports/batch-shortcut.reader.js";

/** Lecture des raccourcis vivants, pour les écrans : des lignes, sans agrégat. */
@Injectable()
export class PrismaBatchShortcutReader extends BatchShortcutReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  live(): Promise<readonly StoredBatchShortcut[]> {
    return this.prisma.productionBatchShortcut.findMany({
      where: { removedAt: null },
      orderBy: [{ sku: "asc" }, { position: "asc" }, { id: "asc" }],
      select: { id: true, sku: true, label: true, pieces: true, position: true },
    });
  }
}

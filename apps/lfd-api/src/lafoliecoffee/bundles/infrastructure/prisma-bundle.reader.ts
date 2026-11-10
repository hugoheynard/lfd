import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Bundle } from "../domain/entities/bundle.js";
import type { BundleSnapshot } from "../domain/entities/bundle-shapes.js";
import { BundleReader } from "../domain/ports/bundle.reader.js";
import { GROUPS_IN_ORDER, toRecord } from "./bundle-rows.js";

/**
 * Les formules pour l'écran. Elles passent par `reconstitute` — une ligne
 * relue revérifie ses invariants — puis ne sortent qu'en instantané.
 */
@Injectable()
export class PrismaBundleReader extends BundleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly BundleSnapshot[]> {
    const rows = await this.prisma.bundle.findMany({
      include: GROUPS_IN_ORDER,
      orderBy: [{ writtenAt: "desc" }, { key: "asc" }],
    });
    return rows.map((row) => Bundle.reconstitute(toRecord(row)).snapshot());
  }

  async find(key: string): Promise<BundleSnapshot | null> {
    const row = await this.prisma.bundle.findUnique({ where: { key }, include: GROUPS_IN_ORDER });
    return row === null ? null : Bundle.reconstitute(toRecord(row)).snapshot();
  }
}

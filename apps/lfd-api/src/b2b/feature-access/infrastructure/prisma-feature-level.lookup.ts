import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { FeatureLevelLookup } from "../domain/ports/feature-level.lookup.js";

/**
 * Les lectures indexées de la résolution : la clé primaire (une clé, ou toutes
 * en un `IN`), l'unicité `(key, email)`.
 */
@Injectable()
export class PrismaFeatureLevelLookup extends FeatureLevelLookup {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async storedOverride(key: string): Promise<string | null> {
    const row = await this.prisma.featureAccessOverride.findUnique({
      where: { key },
      select: { value: true },
    });
    return row?.value ?? null;
  }

  async storedOverrides(keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const rows = await this.prisma.featureAccessOverride.findMany({
      where: { key: { in: [...keys] } },
      select: { key: true, value: true },
    });
    return new Map(rows.map((row) => [row.key, row.value]));
  }

  async isExempt(key: string, normalizedEmail: string): Promise<boolean> {
    const row = await this.prisma.featureAccessExemption.findUnique({
      where: { key_email: { key, email: normalizedEmail } },
      select: { id: true },
    });
    return row !== null;
  }
}

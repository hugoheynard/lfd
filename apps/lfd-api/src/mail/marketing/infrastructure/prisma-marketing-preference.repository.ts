import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailBrandCode } from "../../requests/domain/value-objects/mail-brand.js";
import type { MarketingPreference } from "../domain/entities/marketing-preference.js";
import { MarketingPreferenceRepository } from "../domain/ports/marketing-preference.repository.js";
import { toDomain, toPersistence } from "./marketing-preference-row.js";

/**
 * Le registre, dans le schéma `mail`. Passe par le client ambiant : sous une
 * unité de travail, il écrit dans la transaction de l'appelant.
 */
@Injectable()
export class PrismaMarketingPreferenceRepository extends MarketingPreferenceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(space: MailBrandCode, print: string): Promise<MarketingPreference | null> {
    const row = await this.prisma.mailMarketingPreference.findUnique({
      where: { space_print: { space, print } },
    });
    return row === null ? null : toDomain(row);
  }

  async loadAll(print: string): Promise<readonly MarketingPreference[]> {
    const rows = await this.prisma.mailMarketingPreference.findMany({
      where: { print },
      orderBy: { space: "asc" },
    });
    return rows.map(toDomain);
  }

  /**
   * `upsert` sur `(space, print)` : deux désinscriptions simultanées d'une
   * adresse inconnue créent une ligne, puis la mettent à jour — jamais une
   * violation d'unicité qui annulerait la transaction de l'appelant.
   */
  async save(preference: MarketingPreference): Promise<void> {
    const { id, space, print, ...rest } = toPersistence(preference);
    await this.prisma.mailMarketingPreference.upsert({
      where: { space_print: { space, print } },
      create: { id, space, print, ...rest },
      update: rest,
    });
  }

  /** L'effacement d'un accord (règle 23), et lui seul. */
  async forget(preference: MarketingPreference): Promise<void> {
    await this.prisma.mailMarketingPreference.deleteMany({ where: { id: preference.id } });
  }
}

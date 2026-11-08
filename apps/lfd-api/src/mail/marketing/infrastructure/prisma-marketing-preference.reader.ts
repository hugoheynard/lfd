import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { MailBrandCode } from "../../requests/domain/value-objects/mail-brand.js";
import { MarketingPreferenceReader } from "../domain/ports/marketing-preference.reader.js";
import { toDomain } from "./marketing-preference-row.js";
import type { MarketingStatus } from "../domain/value-objects/marketing-vocabulary.js";

/** La lecture d'un état, relue par l'agrégat (ses valeurs revalidées). */
@Injectable()
export class PrismaMarketingPreferenceReader extends MarketingPreferenceReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async statusOf(space: MailBrandCode, print: string): Promise<MarketingStatus | null> {
    const row = await this.prisma.mailMarketingPreference.findUnique({
      where: { space_print: { space, print } },
    });
    return row === null ? null : toDomain(row).snapshot().status;
  }
}

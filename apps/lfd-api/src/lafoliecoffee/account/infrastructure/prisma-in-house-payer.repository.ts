import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InHousePayer } from "../domain/entities/in-house-payer.js";
import { InHousePayerRepository } from "../domain/ports/in-house-payer.repository.js";

/**
 * Le dépôt de la nature « maison », un historique (`restaurants-maison.md`) :
 * la période vivante est la ligne sans `withdrawn_at`. Un marquage
 * insère une période, un démarquage clôt la vivante ; rien ne s'efface.
 * Deux marquages simultanés butent sur l'index unique partiel
 * `payer_in_house_live_company`.
 */
@Injectable()
export class PrismaInHousePayerRepository extends InHousePayerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(companyId: string): Promise<InHousePayer> {
    const row = await this.prisma.payerInHouse.findFirst({
      where: { companyId, withdrawnAt: null },
      select: { id: true, declaredAt: true, declaredBy: true },
    });
    return InHousePayer.reconstitute(companyId, row);
  }

  async save(payer: InHousePayer): Promise<void> {
    const withdrawal = payer.withdrawal;
    if (withdrawal !== null) {
      await this.prisma.payerInHouse.updateMany({
        where: { id: withdrawal.declarationId, withdrawnAt: null },
        data: { withdrawnAt: withdrawal.withdrawnAt, withdrawnBy: withdrawal.withdrawnBy },
      });
    }
    const opened = payer.opened;
    if (opened !== null) {
      await this.prisma.payerInHouse.create({
        data: { companyId: payer.companyId, ...opened },
      });
    }
  }
}

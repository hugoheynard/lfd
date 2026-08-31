import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { AccountingRules } from "../domain/entities/accounting-rules.js";
import {
  AccountingRulesRepository,
  type AccountingRulesRecord,
} from "../domain/ports/accounting-rules.repository.js";

/**
 * L'identité du singleton. Une constante, comme `ShopifySettings` : c'est elle
 * qui garantit l'unicité, la clé primaire faisant le mur.
 */
const SINGLETON_ID = "accounting";

@Injectable()
export class PrismaAccountingRulesRepository extends AccountingRulesRepository {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async read(): Promise<AccountingRulesRecord | null> {
    const row = await this.prisma.accountingRules.findUnique({ where: { id: SINGLETON_ID } });
    if (row === null) {
      return null;
    }
    return {
      rules: AccountingRules.reconstitute({ proPriceRatioBp: row.proPriceRatioBp }),
      updatedAt: row.updatedAt,
    };
  }

  /**
   * `upsert` et non `update` : le premier réglage crée la ligne, et il ne doit
   * pas demander à l'appelant de savoir laquelle des deux écritures il fait.
   * L'absence de ligne est un état du modèle, pas un cas d'erreur.
   */
  async save(rules: AccountingRules): Promise<void> {
    const { proPriceRatioBp } = rules.snapshot();
    await this.prisma.accountingRules.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, proPriceRatioBp },
      update: { proPriceRatioBp },
    });
  }
}

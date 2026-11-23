import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CompanySalesIdentityReader,
  type CompanySalesIdentity,
} from "../domain/ports/company-sales-identity.reader.js";
import { companyDisplayName } from "../domain/services/company-display-name.js";

/** Une société lue, sous la forme que le `select` rend. */
export interface CompanySalesIdentityRow {
  readonly id: string;
  readonly enseigne: string;
  readonly raisonSociale: string;
  readonly nafCode: string;
}

/** Ligne → identité de vente. Un NAF vide (le défaut de la colonne) n'est pas un code. */
export function companySalesIdentityOf(row: CompanySalesIdentityRow): CompanySalesIdentity {
  return {
    companyId: row.id,
    name: companyDisplayName(row),
    nafCode: row.nafCode === "" ? null : row.nafCode,
  };
}

/**
 * Une requête pour tout le lot ; un lot vide ne touche pas la base. Les
 * sociétés archivées sont rendues : une vente passée reste nommée.
 */
@Injectable()
export class PrismaCompanySalesIdentityReader extends CompanySalesIdentityReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async identitiesOf(companyIds: readonly string[]): Promise<readonly CompanySalesIdentity[]> {
    if (companyIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.company.findMany({
      where: { id: { in: [...new Set(companyIds)] } },
      select: { id: true, enseigne: true, raisonSociale: true, nafCode: true },
      orderBy: { id: "asc" },
    });
    return rows.map(companySalesIdentityOf);
  }
}

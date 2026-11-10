import { Injectable } from "@nestjs/common";

import { CompanyStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CounterCustomerReader,
  type CounterCustomerCard,
} from "../domain/ports/counter-customer.reader.js";

/** Les seules colonnes qu'une carte de comptoir a le droit de porter. */
const CARD_COLUMNS = {
  id: true,
  raisonSociale: true,
  enseigne: true,
  reference: true,
  siret: true,
} as const;

interface CardRow {
  readonly id: string;
  readonly raisonSociale: string;
  readonly enseigne: string;
  readonly reference: string;
  readonly siret: string;
}

function toCard(row: CardRow): CounterCustomerCard {
  return {
    id: row.id,
    name: row.raisonSociale,
    tradeName: row.enseigne,
    reference: row.reference,
    siret: row.siret,
  };
}

/** Adaptateur Prisma des cartes du Comptoir. */
@Injectable()
export class PrismaCounterCustomerReader extends CounterCustomerReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listActive(): Promise<readonly CounterCustomerCard[]> {
    const rows = await this.prisma.company.findMany({
      where: { status: CompanyStatus.active },
      select: CARD_COLUMNS,
      orderBy: [{ enseigne: "asc" }, { raisonSociale: "asc" }],
    });
    return rows.map(toCard);
  }

  async activeCard(companyId: string): Promise<CounterCustomerCard | null> {
    const row = await this.prisma.company.findFirst({
      where: { id: companyId, status: CompanyStatus.active },
      select: CARD_COLUMNS,
    });
    return row === null ? null : toCard(row);
  }
}

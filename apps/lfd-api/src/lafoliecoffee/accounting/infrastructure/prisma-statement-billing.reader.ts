import { companyDisplayName } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import type { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  StatementBillingReader,
  type BillingFollow,
  type SelfPayingEntity,
} from "../domain/ports/statement-billing.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";

const FOLLOW_SELECT = {
  companyId: true,
  parentId: true,
  validFrom: true,
  validTo: true,
  parent: { select: { raisonSociale: true, enseigne: true } },
} as const;

interface FollowRow {
  readonly companyId: string;
  readonly parentId: string;
  readonly validFrom: Date;
  readonly validTo: Date | null;
  readonly parent: { readonly raisonSociale: string; readonly enseigne: string };
}

/**
 * Les périodes `billing` de `company_follows`, lues pour le relevé.
 *
 * « Chevauche le cycle » = `valid_from < closesAt` et (`valid_to` nul ou
 * `> startsAt`) : la même borne `[)` que la contrainte d'exclusion. Le choix
 * de LA période qui couvre une commande est fait par le domaine
 * (`billingFollowAt`), sur ces périodes-là.
 */
@Injectable()
export class PrismaStatementBillingReader extends StatementBillingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async followsTowards(payerId: string, cycle: BillingCycle): Promise<readonly BillingFollow[]> {
    const rows = await this.prisma.companyFollow.findMany({
      where: { parentId: payerId, ...overlapping(cycle) },
      select: FOLLOW_SELECT,
    });
    return rows.map(toFollow);
  }

  async followsOf(companyId: string, cycle: BillingCycle): Promise<readonly BillingFollow[]> {
    const rows = await this.prisma.companyFollow.findMany({
      where: { companyId, ...overlapping(cycle) },
      select: FOLLOW_SELECT,
    });
    return rows.map(toFollow);
  }

  async selfPayingSubAccounts(parentId: string, at: Date): Promise<readonly SelfPayingEntity[]> {
    const rows = await this.prisma.company.findMany({
      where: {
        parentCompanyId: parentId,
        follows: {
          none: {
            aspect: "billing",
            validFrom: { lte: at },
            OR: [{ validTo: null }, { validTo: { gt: at } }],
          },
        },
      },
      select: { id: true, raisonSociale: true, enseigne: true },
    });
    return rows
      .map((row) => ({ companyId: row.id, name: companyDisplayName(row) }))
      .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  }
}

function overlapping(cycle: BillingCycle): Prisma.CompanyFollowWhereInput {
  return {
    aspect: "billing",
    validFrom: { lt: cycle.closesAt },
    OR: [{ validTo: null }, { validTo: { gt: cycle.startsAt } }],
  };
}

function toFollow(row: FollowRow): BillingFollow {
  return {
    companyId: row.companyId,
    payerId: row.parentId,
    payerName: companyDisplayName(row.parent),
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

import { Injectable } from "@nestjs/common";
import { isPublicLegalForm, toLegalForm } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderBudgetCommitmentsReader } from "../domain/ports/order-budget-commitments.reader.js";
import { PayerCommitmentRequirementsReader } from "../domain/ports/payer-commitment-requirements.reader.js";
import type { PayerCommitmentRequirement } from "../domain/services/public-commitment-blocker.js";
import {
  budgetCommitmentOf,
  type InvoiceBudgetCommitment,
} from "../domain/value-objects/invoice-budget-commitment.js";

/** Les deux colonnes de l'engagement sur `orders`, relues sous le verrou de l'émission. */
@Injectable()
export class PrismaOrderBudgetCommitmentsReader extends OrderBudgetCommitmentsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async commitmentsOf(
    orderIds: readonly string[],
  ): Promise<ReadonlyMap<string, InvoiceBudgetCommitment | null>> {
    const rows = await this.prisma.order.findMany({
      where: { id: { in: [...orderIds] } },
      select: { id: true, budgetCommitmentNumber: true, budgetCommitmentServiceCode: true },
    });
    return new Map(
      rows.map((row) => [
        row.id,
        budgetCommitmentOf(row.budgetCommitmentNumber, row.budgetCommitmentServiceCode),
      ]),
    );
  }
}

/**
 * La fiche Chorus des payeurs PUBLICS (forme juridique) : une fiche posée sur
 * une société redevenue privée ne s'applique pas — la forme fait la nature.
 */
@Injectable()
export class PrismaPayerCommitmentRequirementsReader extends PayerCommitmentRequirementsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async requirementsOf(
    payerIds: readonly string[],
  ): Promise<ReadonlyMap<string, PayerCommitmentRequirement>> {
    const rows = await this.prisma.companyChorusRouting.findMany({
      where: { companyId: { in: [...payerIds] } },
      select: {
        companyId: true,
        commitmentRequired: true,
        serviceCodeRequired: true,
        company: { select: { formeJuridique: true } },
      },
    });
    return new Map(
      rows.flatMap((row) => {
        const form = toLegalForm(row.company.formeJuridique);
        return form !== null && isPublicLegalForm(form)
          ? [
              [
                row.companyId,
                {
                  commitmentRequired: row.commitmentRequired,
                  serviceCodeRequired: row.serviceCodeRequired,
                },
              ] as const,
            ]
          : [];
      }),
    );
  }
}

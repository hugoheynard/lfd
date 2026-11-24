import { Injectable } from "@nestjs/common";
import {
  COMMITMENT_TIMINGS,
  isPublicLegalForm,
  toLegalForm,
  type CommitmentTiming,
} from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { OrderBudgetCommitmentsReader } from "../domain/ports/order-budget-commitments.reader.js";
import { PayerCommitmentRequirementsReader } from "../domain/ports/payer-commitment-requirements.reader.js";
import { UnknownCommitmentTimingError } from "../domain/errors/period-quote-errors.js";
import type { PayerCommitmentSheet } from "../domain/services/public-commitment-blocker.js";
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
 * Le moment du numéro (`commitment_timing`) se lit avec elle : c'est lui qui
 * met un groupe en devis à la clôture (P2 bis).
 */
@Injectable()
export class PrismaPayerCommitmentRequirementsReader extends PayerCommitmentRequirementsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async requirementsOf(
    payerIds: readonly string[],
  ): Promise<ReadonlyMap<string, PayerCommitmentSheet>> {
    const rows = await this.prisma.companyChorusRouting.findMany({
      where: { companyId: { in: [...payerIds] } },
      select: {
        companyId: true,
        commitmentRequired: true,
        serviceCodeRequired: true,
        commitmentTiming: true,
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
                  timing: timingOf(row.commitmentTiming),
                },
              ] as const,
            ]
          : [];
      }),
    );
  }
}

/** @throws {UnknownCommitmentTimingError} une valeur que le CHECK de la base aurait dû refuser. */
function timingOf(raw: string): CommitmentTiming {
  const known = COMMITMENT_TIMINGS.find((timing) => timing === raw);
  if (known === undefined) {
    throw new UnknownCommitmentTimingError(raw);
  }
  return known;
}

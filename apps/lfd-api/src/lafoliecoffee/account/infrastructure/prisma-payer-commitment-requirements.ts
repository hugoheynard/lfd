import { Injectable } from "@nestjs/common";
import { isPublicLegalForm, toLegalForm } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { PayerCommitmentRequirements } from "../../orders/domain/ports/payer-commitment-requirements.js";
import {
  PRIVATE_PAYER,
  type PayerCommitmentTerms,
} from "../../orders/domain/services/budget-commitment-rule.js";

/**
 * Ce qu'un payeur exige de l'engagement budgétaire, lu là où le compte le
 * range : la forme juridique (la nature publique, P1a) et la fiche Chorus Pro
 * (`company_chorus_routing`). Une société publique sans fiche n'exige rien :
 * elle ne peut pas être active (P1a), donc pas commander au compte.
 */
@Injectable()
export class PrismaPayerCommitmentRequirements extends PayerCommitmentRequirements {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async of(payerCompanyId: string): Promise<PayerCommitmentTerms> {
    const company = await this.prisma.company.findUnique({
      where: { id: payerCompanyId },
      select: {
        formeJuridique: true,
        chorusRouting: {
          select: { commitmentRequired: true, serviceCodeRequired: true, defaultServiceCode: true },
        },
      },
    });
    const form = company === null ? null : toLegalForm(company.formeJuridique);
    if (company === null || form === null || !isPublicLegalForm(form)) {
      return PRIVATE_PAYER;
    }
    const routing = company.chorusRouting;
    return {
      kind: "public",
      commitmentRequired: routing?.commitmentRequired ?? false,
      serviceCodeRequired: routing?.serviceCodeRequired ?? false,
      defaultServiceCode: routing?.defaultServiceCode ?? "",
    };
  }
}

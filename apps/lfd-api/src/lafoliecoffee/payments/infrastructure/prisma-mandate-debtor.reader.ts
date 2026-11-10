import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MandateDebtorReader,
  type ResolvedMandateDebtor,
} from "../domain/ports/mandate-debtor.reader.js";

/** Ce qu'il faut d'une société pour la nommer débitrice. */
const IDENTITY = { id: true, raisonSociale: true, siren: true, formeJuridique: true } as const;

/** Une décision datée qui couvre `at` : début inclus, fin exclue (`[)`). */
function coveringAt(at: Date): {
  validFrom: { lte: Date };
  OR: ({ validTo: null } | { validTo: { gt: Date } })[];
} {
  return { validFrom: { lte: at }, OR: [{ validTo: null }, { validTo: { gt: at } }] };
}

/**
 * La société, la période `billing` qui la couvre à `at`, et la forme de
 * prélèvement en vigueur à `at` (sans période : le mandat du principal).
 */
@Injectable()
export class PrismaMandateDebtorReader extends MandateDebtorReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolve(companyId: string, at: Date): Promise<ResolvedMandateDebtor | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        ...IDENTITY,
        follows: {
          where: { aspect: "billing", ...coveringAt(at) },
          take: 1,
          select: { parent: { select: IDENTITY } },
        },
        collectionForms: { where: coveringAt(at), take: 1, select: { form: true } },
      },
    });
    if (company === null) {
      return null;
    }
    const payer = company.follows[0]?.parent;
    const debtorRow = payer ?? company;
    const ownIban = company.collectionForms[0]?.form === "own_iban";
    return {
      debtor: {
        companyId: debtorRow.id,
        siren: debtorRow.siren,
        name: debtorRow.raisonSociale,
        legalForm: debtorRow.formeJuridique,
      },
      accountCompanyId: payer === undefined || ownIban ? company.id : payer.id,
      billedTo: payer === undefined ? null : { companyId: payer.id, name: payer.raisonSociale },
    };
  }
}

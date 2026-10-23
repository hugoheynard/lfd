import { companyDisplayName } from "@lfd/contracts";

import type { PayerStanding } from "../domain/ports/payer-standing.reader.js";

/**
 * Le compte et ses périodes `billing` (`company_follows`) qui couvrent `at` —
 * la borne `[)` de la contrainte d'exclusion. Partagé par la lecture d'UN
 * compte et celle de TOUS les comptes : un seul critère de « période en cours ».
 */
export function payerStandingSelect(at: Date) {
  return {
    id: true,
    raisonSociale: true,
    enseigne: true,
    follows: {
      where: {
        aspect: "billing" as const,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
      select: {
        companyId: true,
        parentId: true,
        validFrom: true,
        validTo: true,
        parent: { select: { raisonSociale: true, enseigne: true } },
      },
    },
  };
}

interface NamedRow {
  readonly raisonSociale: string;
  readonly enseigne: string;
}

/** La ligne lue par `payerStandingSelect`. */
export interface PayerStandingRow extends NamedRow {
  readonly id: string;
  readonly follows: readonly {
    readonly companyId: string;
    readonly parentId: string;
    readonly validFrom: Date;
    readonly validTo: Date | null;
    readonly parent: NamedRow;
  }[];
}

export function payerStandingOf(row: PayerStandingRow): PayerStanding {
  return {
    companyId: row.id,
    name: companyDisplayName(row),
    follows: row.follows.map((follow) => ({
      companyId: follow.companyId,
      payerId: follow.parentId,
      payerName: companyDisplayName(follow.parent),
      validFrom: follow.validFrom,
      validTo: follow.validTo,
    })),
  };
}

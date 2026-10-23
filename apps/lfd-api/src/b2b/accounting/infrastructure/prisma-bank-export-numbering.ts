import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  AccountBankExportNumbering,
  MandateBankExportNumbering,
} from "../domain/ports/bank-export-numbering.js";
import { partFromRow } from "./bank-export-naming.mapper.js";
import type { PreviousExportPart } from "../domain/services/bank-export-reference.js";

/** La sorte d'export, telle que la table `bank_export_counter` la range. */
type CounterKind = "accounts" | "mandates";

/** Le compteur n'a rendu aucune ligne — impossible sur un `INSERT … RETURNING`. */
class BankExportCounterSilentError extends TechnicalError {
  constructor() {
    super(
      "accounting.bank_export.counter_silent",
      "Le compteur des numéros d'export bancaire n'a rendu aucun rang : l'export n'est pas préparé. Prévenir l'équipe technique.",
    );
  }
}

/**
 * Le rang suivant — `INSERT … ON CONFLICT DO UPDATE … RETURNING`, comme le
 * compteur des commandes (`order_number_counter`) : la ligne reste verrouillée
 * jusqu'au COMMIT de la préparation.
 */
async function nextRankOf(prisma: PrismaService, kind: CounterKind): Promise<number> {
  const rows = await prisma.$queryRaw<{ last_rank: number }[]>`
    INSERT INTO "bank_export_counter" ("kind", "last_rank")
    VALUES (${kind}, 1)
    ON CONFLICT ("kind")
    DO UPDATE SET "last_rank" = "bank_export_counter"."last_rank" + 1
    RETURNING "last_rank"`;
  const rank = rows[0]?.last_rank;
  if (rank === undefined) {
    throw new BankExportCounterSilentError();
  }
  return rank;
}

function partOf(
  row: { readonly partRank: number | null; readonly partCount: number | null } | null,
): PreviousExportPart | null {
  return row === null ? null : { part: partFromRow(row) };
}

/**
 * La requête du dernier export non abandonné d'une entité — la même pour les
 * comptes et les mandats, qui ne diffèrent que par leur table.
 */
function lastPartQuery(legalEntityId: string): {
  readonly where: { readonly legalEntityId: string; readonly abandonedAt: null };
  orderBy: [{ readonly createdAt: "desc" }, { readonly id: "desc" }];
  readonly select: { readonly partRank: true; readonly partCount: true };
} {
  return {
    where: { legalEntityId, abandonedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { partRank: true, partCount: true },
  };
}

@Injectable()
export class PrismaAccountBankExportNumbering extends AccountBankExportNumbering {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextRank(): Promise<number> {
    return nextRankOf(this.prisma, "accounts");
  }

  async lastPart(legalEntityId: string): Promise<PreviousExportPart | null> {
    return partOf(await this.prisma.accountBankExport.findFirst(lastPartQuery(legalEntityId)));
  }
}

@Injectable()
export class PrismaMandateBankExportNumbering extends MandateBankExportNumbering {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextRank(): Promise<number> {
    return nextRankOf(this.prisma, "mandates");
  }

  async lastPart(legalEntityId: string): Promise<PreviousExportPart | null> {
    return partOf(await this.prisma.mandateBankExport.findFirst(lastPartQuery(legalEntityId)));
  }
}

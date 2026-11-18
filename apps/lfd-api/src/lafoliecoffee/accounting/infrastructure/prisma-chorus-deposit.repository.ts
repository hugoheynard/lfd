import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ChorusDeposit } from "../domain/entities/chorus-deposit.js";
import { ChorusDepositRepository } from "../domain/ports/chorus-deposit.repository.js";
import { dayColumn } from "./collection-notice.mapper.js";
import { CHORUS_INVOICE_SELECT, chorusEntryOf, chorusFactsOf } from "./chorus-deposit-rows.js";

/**
 * Le dépôt Chorus d'une facture : la pièce et son journal en une lecture, les
 * lignes neuves en un `createMany`. Append-only (déclencheur
 * `invoice_chorus_deposit_append_only`) ; l'unicité (facture, sorte) est le
 * filet de deux gestes concurrents — le chemin, c'est l'agrégat.
 */
@Injectable()
export class PrismaChorusDepositRepository extends ChorusDepositRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(invoiceId: string): Promise<ChorusDeposit | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: CHORUS_INVOICE_SELECT,
    });
    if (row === null) {
      return null;
    }
    return ChorusDeposit.of(
      chorusFactsOf(row),
      row.chorusDeposits.map((entry) => chorusEntryOf(row.id, entry)),
    );
  }

  async save(deposit: ChorusDeposit): Promise<void> {
    const pending = deposit.pending();
    if (pending.length === 0) {
      return;
    }
    await this.prisma.invoiceChorusDeposit.createMany({
      data: pending.map((entry) => ({
        id: entry.id,
        invoiceId: deposit.invoice.invoiceId,
        kind: entry.kind,
        occurredOn: dayColumn(entry.occurredOn),
        reason: entry.reason,
        staffId: entry.staffId,
        staffName: entry.staffName,
        recordedAt: entry.recordedAt,
      })),
    });
  }
}

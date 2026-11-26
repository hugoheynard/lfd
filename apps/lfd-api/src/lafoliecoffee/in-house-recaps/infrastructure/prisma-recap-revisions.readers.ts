import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { CurrentNoteVersion } from "../domain/entities/in-house-recap.js";
import { CurrentNoteVersionsReader } from "../domain/ports/current-note-versions.reader.js";
import { type RecapSummary, PayerRecapsReader } from "../domain/ports/payer-recaps.reader.js";
import { type RevisedRecap, RevisedRecapsReader } from "../domain/ports/revised-recaps.reader.js";

/**
 * Les lectures de révision (D8). Elles lisent le BL COURANT
 * (`delivery_note.content_version`), jamais une version figée : la version
 * figée est celle que le récapitulatif a gardée.
 */
@Injectable()
export class PrismaCurrentNoteVersionsReader extends CurrentNoteVersionsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionsOf(deliveryNoteIds: readonly string[]): Promise<readonly CurrentNoteVersion[]> {
    const rows = await this.prisma.deliveryNote.findMany({
      where: { id: { in: [...deliveryNoteIds] } },
      select: { id: true, contentVersion: true },
    });
    return rows.map((row) => ({ deliveryNoteId: row.id, contentVersion: row.contentVersion }));
  }
}

/** Le BL couvert, et sa version courante. */
const COVERED_NOTE = {
  deliveryNoteId: true,
  number: true,
  contentVersion: true,
  deliveryNote: { select: { contentVersion: true } },
} as const;

/** Les récapitulatifs d'un payeur, du mois le plus récent au plus ancien, rectificatifs en tête. */
@Injectable()
export class PrismaPayerRecapsReader extends PayerRecapsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async summariesOf(payerId: string): Promise<readonly RecapSummary[]> {
    const rows = await this.prisma.inHouseRecap.findMany({
      where: { payerId },
      select: {
        id: true,
        number: true,
        month: true,
        issuedAt: true,
        storageKey: true,
        replacedById: true,
        notes: { select: COVERED_NOTE },
      },
      orderBy: [{ month: "desc" }, { issuedAt: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      month: row.month,
      issuedAt: row.issuedAt,
      hasDocument: row.storageKey !== null,
      replacedById: row.replacedById,
      noteCount: row.notes.length,
      revisedNoteCount:
        row.replacedById === null
          ? row.notes.filter((note) => note.deliveryNote.contentVersion > note.contentVersion)
              .length
          : 0,
    }));
  }
}

/** Une ligne du signalement, telle que la requête la rend. */
interface RevisedRow {
  readonly recap_id: string;
  readonly payer_id: string;
  readonly recap_number: string;
  readonly month: string;
  readonly delivery_note_id: string;
  readonly note_number: string;
  readonly frozen_version: number;
  readonly current_version: number;
}

/**
 * Les signalements, tous payeurs : un récapitulatif non remplacé dont un BL a
 * été révisé. La comparaison des deux versions se fait dans la requête : on
 * ne charge que les BL révisés.
 */
@Injectable()
export class PrismaRevisedRecapsReader extends RevisedRecapsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async revised(): Promise<readonly RevisedRecap[]> {
    const rows = await this.prisma.$queryRaw<RevisedRow[]>`
      SELECT r."id" AS recap_id, r."payer_id", r."number" AS recap_number, r."month",
             n."delivery_note_id", n."number" AS note_number,
             n."content_version" AS frozen_version, dn."content_version" AS current_version
        FROM "public"."in_house_recap_note" n
        JOIN "public"."delivery_note" dn ON dn."id" = n."delivery_note_id"
        JOIN "public"."in_house_recap" r ON r."id" = n."recap_id"
       WHERE n."replaced_at" IS NULL
         AND dn."content_version" > n."content_version"
       ORDER BY r."month", r."number", n."number"`;
    const byRecap = new Map<string, RevisedRecap>();
    for (const row of rows) {
      const known = byRecap.get(row.recap_id) ?? {
        recapId: row.recap_id,
        payerId: row.payer_id,
        number: row.recap_number,
        month: row.month,
        notes: [],
      };
      byRecap.set(row.recap_id, {
        ...known,
        notes: [
          ...known.notes,
          {
            deliveryNoteId: row.delivery_note_id,
            number: row.note_number,
            frozenVersion: row.frozen_version,
            currentVersion: row.current_version,
          },
        ],
      });
    }
    return [...byRecap.values()];
  }
}

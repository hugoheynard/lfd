import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CREDIT_NOTE } from "../domain/entities/invoice.types.js";
import {
  IssuedCreditNotesReader,
  type IssuedCreditNote,
} from "../domain/ports/issued-credit-notes.reader.js";
import { ISSUED_CREDIT_NOTE_SELECT, issuedCreditNoteOf } from "./issued-credit-note.rows.js";

/**
 * **Les avoirs d'une période d'émission** — une requête, bornée sur
 * `issued_on` (`@db.Date`, déjà un jour local), bons compris.
 */
@Injectable()
export class PrismaIssuedCreditNotesReader extends IssuedCreditNotesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async issuedBetween(fromDay: string, toDay: string): Promise<readonly IssuedCreditNote[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        type: CREDIT_NOTE,
        issuedOn: {
          gte: new Date(`${fromDay}T00:00:00.000Z`),
          lte: new Date(`${toDay}T00:00:00.000Z`),
        },
      },
      select: ISSUED_CREDIT_NOTE_SELECT,
      orderBy: [{ issuedOn: "asc" }, { number: "asc" }],
    });
    return rows.map(issuedCreditNoteOf);
  }
}

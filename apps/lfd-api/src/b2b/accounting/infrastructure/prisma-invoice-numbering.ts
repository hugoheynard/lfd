import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { InvoiceIssuedBeforePreviousError } from "../domain/errors/invoice-errors.js";
import { InvoiceNumbering } from "../domain/ports/invoice-numbering.js";
import { InvoiceNumber } from "../domain/value-objects/invoice-number.js";

/** Demandé hors transaction : le rang serait perdu au premier échec qui suit. */
export class InvoiceNumberingOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.invoice.numbering_outside_transaction",
      "Le numéro de facture se prend dans la transaction de l'émission : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * Le compteur `invoice_number_counter`, avancé d'un rang par un seul ordre :
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`. La ligne reste verrouillée
 * jusqu'au `COMMIT` — une émission concurrente de la même entité attend, puis
 * prend le rang suivant — et un `ROLLBACK` la rend telle qu'elle était :
 * aucun trou. La base refuse d'ailleurs tout pas autre que +1
 * (`invoice_number_counter_monotonic`).
 */
@Injectable()
export class PrismaInvoiceNumbering extends InvoiceNumbering {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Le `WHERE` du `DO UPDATE` laisse la ligne intacte quand `issuedOn` précède
   * la dernière émission : aucune ligne rendue, refus nommé, aucun rang pris.
   */
  async next(legalEntityId: string, issuedOn: string): Promise<InvoiceNumber> {
    if (currentTransaction() === undefined) {
      throw new InvoiceNumberingOutsideTransactionError();
    }
    const year = Number(issuedOn.slice(0, 4));
    const rows = await this.prisma.$queryRaw<{ last_rank: number }[]>`
      INSERT INTO "invoice_number_counter" ("legal_entity_id", "year", "last_rank", "last_issued_on")
      VALUES (${legalEntityId}, ${year}, 1, ${issuedOn}::date)
      ON CONFLICT ("legal_entity_id", "year")
      DO UPDATE SET
        "last_rank" = "invoice_number_counter"."last_rank" + 1,
        "last_issued_on" = GREATEST("invoice_number_counter"."last_issued_on", EXCLUDED."last_issued_on")
      WHERE "invoice_number_counter"."last_issued_on" <= EXCLUDED."last_issued_on"
      RETURNING "last_rank"`;
    const rank = rows[0]?.last_rank;
    if (rank === undefined) {
      throw new InvoiceIssuedBeforePreviousError(legalEntityId, issuedOn);
    }
    return InvoiceNumber.compose(year, rank);
  }
}

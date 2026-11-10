import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  InvoiceIssuanceBlockedError,
  InvoiceIssuedBeforePreviousError,
} from "../domain/errors/invoice-errors.js";
import { invoicePrefixMissingBlocker } from "../domain/services/invoice-issuance-blockers.js";
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

/** Une numérotation demandée pour une entité absente : le code s'est trompé d'identifiant. */
export class InvoiceNumberingUnknownEntityError extends TechnicalError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.invoice.numbering_unknown_entity",
      `Aucune entité ${legalEntityId} à numéroter : rien n'est émis. Prévenir l'équipe technique.`,
    );
  }
}

/**
 * Le compteur `invoice_number_counter`, avancé d'un rang par un seul ordre :
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`. La ligne reste verrouillée
 * jusqu'au `COMMIT` — une émission concurrente de la même entité attend, puis
 * prend le rang suivant — et un `ROLLBACK` la rend telle qu'elle était :
 * aucun trou. La base refuse d'ailleurs tout pas autre que +1
 * (`invoice_number_counter_monotonic`), une pièce dont le rang n'est pas
 * celui que le compteur vient d'atteindre (`invoice_rank_from_counter`), et
 * un compteur qui finit la transaction sans sa pièce
 * (`invoice_number_counter_has_invoice`, lot ZA).
 *
 * Le préfixe de l'entité est lu AVANT le compteur, sous `FOR SHARE` : un
 * changement de préfixe concurrent attend la fin de l'émission (puis la base
 * le refuse, une pièce existant), et l'ordre des verrous — entité, puis
 * compteur — est celui du déclencheur `invoice_prefix_of_entity`.
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
    const prefix = await this.lockedPrefix(legalEntityId);
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
    return InvoiceNumber.compose(prefix, year, rank);
  }

  /** @throws {InvoiceIssuanceBlockedError} l'entité n'a pas de préfixe — aucun rang pris. */
  private async lockedPrefix(legalEntityId: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ name: string; invoice_prefix: string | null }[]>`
      SELECT "name", "invoice_prefix" FROM "legal_entities"
      WHERE "id" = ${legalEntityId}
      FOR SHARE`;
    const entity = rows[0];
    if (entity === undefined) {
      throw new InvoiceNumberingUnknownEntityError(legalEntityId);
    }
    if (entity.invoice_prefix === null) {
      throw new InvoiceIssuanceBlockedError([invoicePrefixMissingBlocker(entity.name)]);
    }
    return entity.invoice_prefix;
  }
}

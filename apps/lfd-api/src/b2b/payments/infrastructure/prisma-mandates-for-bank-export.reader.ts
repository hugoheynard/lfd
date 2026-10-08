import { Injectable } from "@nestjs/common";

import {
  MandatesForBankExportReader,
  type MandateExcludedFromBankExport,
  type MandateForBankExport,
  type MandatesForBankExport,
} from "../../accounting/domain/ports/mandates-for-bank-export.reader.js";
import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { debitedAccounts, type DebitedAccountRow } from "./mandate-accounts.js";

const MANDATE_COLUMNS = {
  id: true,
  companyId: true,
  bankAccountId: true,
  debtorCompanyId: true,
  creditorId: true,
  reference: true,
  scheme: true,
  paymentType: true,
  acceptedAt: true,
} as const;

/**
 * Les mandats actifs d'une entité émettrice, pour la banque (plan
 * `plan-export-des-mandats-pour-la-banque.md`, § 2 bis-2). Rangé côté
 * `payments`, qui possède les mandats et les RIB ; descellé par le même
 * `FieldCipher` que les lecteurs du lot, et sur le compte que le mandat
 * DÉSIGNE (`debitedAccounts`, T8) — celui que le lot débitera.
 *
 * Les mandats repris (`creditor_id` nul) sont rendus écartés pour toute
 * entité : ils ne sont à personne, et l'écran doit les nommer (A17).
 */
@Injectable()
export class PrismaMandatesForBankExportReader extends MandatesForBankExportReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async activeOf(creditorId: string): Promise<MandatesForBankExport> {
    const mandates = await this.prisma.paymentMandate.findMany({
      where: { status: "active", OR: [{ creditorId }, { creditorId: null }] },
      orderBy: [{ reference: "asc" }, { id: "asc" }],
      select: MANDATE_COLUMNS,
    });
    const owned = mandates.filter((mandate) => mandate.creditorId !== null);
    const accountOf = await debitedAccounts(this.prisma, owned);
    const exportable: MandateForBankExport[] = [];
    const excluded: MandateExcludedFromBankExport[] = [];
    for (const mandate of mandates) {
      const debtorCompanyId = mandate.debtorCompanyId ?? mandate.companyId;
      const named = { mandateId: mandate.id, reference: mandate.reference, debtorCompanyId };
      const account = mandate.creditorId === null ? undefined : accountOf(mandate);
      const reason = exclusionOf(mandate.creditorId, account);
      if (reason !== null || account === undefined) {
        excluded.push({ ...named, reason: reason ?? "no_account" });
        continue;
      }
      if (mandate.acceptedAt === null) {
        throw new UnsignedActiveMandateError(mandate.id);
      }
      exportable.push({
        ...named,
        iban: this.cipher.open(account.ibanSealed),
        bic: account.bic,
        signedAt: mandate.acceptedAt,
        scheme: mandate.scheme,
        paymentType: mandate.paymentType,
      });
    }
    return { exportable, excluded };
  }
}

function exclusionOf(
  creditorId: string | null,
  account: DebitedAccountRow | undefined,
): MandateExcludedFromBankExport["reason"] | null {
  if (creditorId === null) {
    return "taken_over";
  }
  if (account === undefined) {
    return "no_account";
  }
  return account.bic === "" ? "no_bic" : null;
}

/** Inatteignable tant que `payment_mandates_active_is_signed` existe. */
class UnsignedActiveMandateError extends TechnicalError {
  constructor(mandateId: string) {
    super(
      "payments.bank_export_mandate.active_without_signature",
      `Le mandat actif ${mandateId} n'a pas de date de signature : la colonne F du fichier de la banque serait vide. Vérifier la migration « mandat_actif_signe », puis corriger la ligne.`,
    );
  }
}

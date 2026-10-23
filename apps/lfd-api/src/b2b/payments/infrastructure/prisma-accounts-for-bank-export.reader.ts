import { Injectable } from "@nestjs/common";

import {
  AccountsForBankExportReader,
  type AccountExcludedFromBankExport,
  type AccountForBankExport,
  type AccountsForBankExport,
} from "../../accounting/domain/ports/accounts-for-bank-export.reader.js";
import { FieldCipher } from "../../../platform/crypto/field-cipher.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { debitedAccounts } from "./mandate-accounts.js";

const ACCOUNT_COLUMNS = {
  id: true,
  companyId: true,
  holder: true,
  addressLine1: true,
  addressLine2: true,
  postalCode: true,
  city: true,
  countryCode: true,
  ibanSealed: true,
  ibanLast4: true,
  bic: true,
  createdAt: true,
  company: { select: { raisonSociale: true, siren: true } },
} as const;

/**
 * Les comptes que débitent les mandats actifs d'une entité émettrice, pour
 * la banque (doc `prerequis-export-ribs.md` § 4, lot 2). Rangé côté
 * `payments`, qui possède les mandats et les RIB ; le compte est celui que le
 * mandat DÉSIGNE (`debitedAccounts`, T8), descellé par le même `FieldCipher`.
 *
 * Un compte n'apparaît qu'une fois (R5). Les mandats repris (`creditor_id`
 * nul) n'appartiennent à aucune entité, et ne partent pas à la banque : ils
 * n'amènent pas leur compte.
 */
@Injectable()
export class PrismaAccountsForBankExportReader extends AccountsForBankExportReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {
    super();
  }

  async debitedBy(creditorId: string): Promise<AccountsForBankExport> {
    const mandates = await this.prisma.paymentMandate.findMany({
      where: { status: "active", creditorId },
      select: { companyId: true, bankAccountId: true },
    });
    const accountOf = await debitedAccounts(this.prisma, mandates);
    const ids = [...new Set(mandates.flatMap((mandate) => accountOf(mandate)?.id ?? []))];
    const rows = await this.prisma.companyBankAccount.findMany({
      where: { id: { in: ids } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: ACCOUNT_COLUMNS,
    });
    const exportable: AccountForBankExport[] = [];
    const excluded: AccountExcludedFromBankExport[] = [];
    for (const row of rows) {
      const named = {
        bankAccountId: row.id,
        companyName: row.company.raisonSociale,
        ibanLast4: row.ibanLast4,
      };
      if (row.bic === "") {
        excluded.push({ ...named, reason: "no_bic" });
        continue;
      }
      exportable.push({
        ...named,
        companyId: row.companyId,
        siren: row.company.siren === "" ? null : row.company.siren,
        holder: row.holder,
        addressLine1: row.addressLine1,
        addressLine2: row.addressLine2,
        postalCode: row.postalCode,
        city: row.city,
        countryCode: row.countryCode,
        iban: this.cipher.open(row.ibanSealed),
        bic: row.bic,
        recordedAt: row.createdAt,
      });
    }
    return { exportable, excluded };
  }
}

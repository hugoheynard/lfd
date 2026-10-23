import type { Provider } from "@nestjs/common";

import { AbandonAccountBankExportHandler } from "./application/commands/abandon-account-bank-export.handler.js";
import { DeclareBankAccountKnownHandler } from "./application/commands/declare-bank-account-known.handler.js";
import { ExportAccountsForBankHandler } from "./application/commands/export-accounts-for-bank.handler.js";
import { MarkAccountBankExportImportedHandler } from "./application/commands/mark-account-bank-export-imported.handler.js";
import { RecordAccountBankExportDownloadHandler } from "./application/commands/record-account-bank-export-download.handler.js";
import { ExportAccountBankFileHandler } from "./application/queries/export-account-bank-file.handler.js";
import { GetAccountBankExportsHandler } from "./application/queries/get-account-bank-exports.handler.js";
import {
  AccountBankExportRepository,
  KnownBankAccountRepository,
} from "./domain/ports/account-bank-export.repository.js";
import {
  AccountBankExportsReader,
  KnownAccountFingerprintsReader,
} from "./domain/ports/account-bank-exports.reader.js";
import { AdminAccountBankExportsController } from "./http/admin-account-bank-exports.controller.js";
import {
  PrismaAccountBankExportRepository,
  PrismaKnownBankAccountRepository,
} from "./infrastructure/prisma-account-bank-export.repository.js";
import {
  PrismaAccountBankExportsReader,
  PrismaKnownAccountFingerprintsReader,
} from "./infrastructure/prisma-account-bank-exports.reader.js";

/**
 * L'export des comptes destinataires pour la banque (doc
 * `prerequis-export-ribs.md`). À part du module, qui dépasse déjà la taille
 * d'un fichier. Le lecteur des comptes descellés (`AccountsForBankExportReader`)
 * n'est pas ici : `payments` l'implémente, et
 * `appBootstrap/debtor-mandate.module.ts` le relie.
 */
export const ACCOUNT_BANK_EXPORT_PROVIDERS: readonly Provider[] = [
  { provide: AccountBankExportRepository, useClass: PrismaAccountBankExportRepository },
  { provide: KnownBankAccountRepository, useClass: PrismaKnownBankAccountRepository },
  { provide: KnownAccountFingerprintsReader, useClass: PrismaKnownAccountFingerprintsReader },
  { provide: AccountBankExportsReader, useClass: PrismaAccountBankExportsReader },
  ExportAccountsForBankHandler,
  MarkAccountBankExportImportedHandler,
  AbandonAccountBankExportHandler,
  RecordAccountBankExportDownloadHandler,
  DeclareBankAccountKnownHandler,
  ExportAccountBankFileHandler,
  GetAccountBankExportsHandler,
];

export const ACCOUNT_BANK_EXPORT_CONTROLLERS = [AdminAccountBankExportsController];

import type { Provider } from "@nestjs/common";

import { ExportMandatesForBankHandler } from "./application/commands/export-mandates-for-bank.handler.js";
import { MarkMandateBankExportImportedHandler } from "./application/commands/mark-mandate-bank-export-imported.handler.js";
import { ExportMandateBankFileHandler } from "./application/queries/export-mandate-bank-file.handler.js";
import { GetMandateBankExportsHandler } from "./application/queries/get-mandate-bank-exports.handler.js";
import { MandateBankExportRepository } from "./domain/ports/mandate-bank-export.repository.js";
import {
  ImportedMandateAccountsReader,
  MandateBankExportsReader,
} from "./domain/ports/mandate-bank-exports.reader.js";
import { PrismaMandateBankExportRepository } from "./infrastructure/prisma-mandate-bank-export.repository.js";
import {
  PrismaImportedMandateAccountsReader,
  PrismaMandateBankExportsReader,
} from "./infrastructure/prisma-mandate-bank-exports.reader.js";

/**
 * Les providers du lot M1 (plan `export-des-mandats-pour-la-banque.md`) :
 * l'export des mandats pour la banque. À part du module, qui dépasse déjà la
 * taille d'un fichier. Le lecteur des mandats descellés
 * (`MandatesForBankExportReader`) n'est pas ici : `payments` l'implémente, et
 * `appBootstrap/debtor-mandate.module.ts` le relie.
 */
export const MANDATE_BANK_EXPORT_PROVIDERS: readonly Provider[] = [
  { provide: MandateBankExportRepository, useClass: PrismaMandateBankExportRepository },
  { provide: ImportedMandateAccountsReader, useClass: PrismaImportedMandateAccountsReader },
  { provide: MandateBankExportsReader, useClass: PrismaMandateBankExportsReader },
  ExportMandatesForBankHandler,
  MarkMandateBankExportImportedHandler,
  ExportMandateBankFileHandler,
  GetMandateBankExportsHandler,
];

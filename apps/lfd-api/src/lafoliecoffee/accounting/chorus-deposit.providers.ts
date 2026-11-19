import type { Provider, Type } from "@nestjs/common";

import { NoteChorusAcceptanceHandler } from "./application/commands/note-chorus-acceptance.handler.js";
import { NoteChorusDepositHandler } from "./application/commands/note-chorus-deposit.handler.js";
import { NoteChorusRejectionHandler } from "./application/commands/note-chorus-rejection.handler.js";
import { TransmitPublicInvoice } from "./application/handlers/transmit-public-invoice.handler.js";
import { GetChorusDepositPdfHandler } from "./application/queries/get-chorus-deposit-pdf.handler.js";
import { ListChorusInvoicesDepositedHandler } from "./application/queries/list-chorus-invoices-deposited.handler.js";
import { ListChorusInvoicesToDepositHandler } from "./application/queries/list-chorus-invoices-to-deposit.handler.js";
import { ChorusDepositStandingsReader } from "./domain/ports/chorus-deposit-standings.reader.js";
import { ChorusDepositRepository } from "./domain/ports/chorus-deposit.repository.js";
import { ChorusInvoicesReader } from "./domain/ports/chorus-invoices.reader.js";
import { EInvoiceTransport } from "./domain/ports/e-invoice-transport.js";
import { AdminChorusDepositsController } from "./http/admin-chorus-deposits.controller.js";
import { ManualChorusDeposit } from "./infrastructure/manual-chorus-deposit.js";
import { PrismaChorusDepositStandingsReader } from "./infrastructure/prisma-chorus-deposit-standings.reader.js";
import { PrismaChorusDepositRepository } from "./infrastructure/prisma-chorus-deposit.repository.js";
import { PrismaChorusInvoicesReader } from "./infrastructure/prisma-chorus-invoices.reader.js";

/**
 * Le dépôt sur Chorus Pro, à la main (plan `plan-clients-publics-chorus.md`,
 * P3). Le transport est `ManualChorusDeposit` ; P4 y substituera celui de la
 * plateforme agréée.
 */
export const CHORUS_DEPOSIT_PROVIDERS: readonly Provider[] = [
  { provide: ChorusDepositRepository, useClass: PrismaChorusDepositRepository },
  { provide: ChorusDepositStandingsReader, useClass: PrismaChorusDepositStandingsReader },
  { provide: ChorusInvoicesReader, useClass: PrismaChorusInvoicesReader },
  { provide: EInvoiceTransport, useClass: ManualChorusDeposit },
  NoteChorusDepositHandler,
  NoteChorusRejectionHandler,
  NoteChorusAcceptanceHandler,
  ListChorusInvoicesToDepositHandler,
  ListChorusInvoicesDepositedHandler,
  GetChorusDepositPdfHandler,
  TransmitPublicInvoice,
];

export const CHORUS_DEPOSIT_CONTROLLERS: readonly Type[] = [AdminChorusDepositsController];

import type { Provider } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import { ResendInvoiceNoticeHandler } from "./application/commands/resend-invoice-notice.handler.js";
import { RenderCreditNoteDocument } from "./application/handlers/render-credit-note-document.handler.js";
import { SendInvoiceNotice } from "./application/handlers/send-invoice-notice.handler.js";
import { GetIssuedInvoiceDocumentHandler } from "./application/queries/get-issued-invoice-document.handler.js";
import { GetIssuedInvoiceHandler } from "./application/queries/get-issued-invoice.handler.js";
import { GetMyCompanyInvoiceDocumentHandler } from "./application/queries/get-my-company-invoice-document.handler.js";
import { GetMyCompanyInvoiceHandler } from "./application/queries/get-my-company-invoice.handler.js";
import { ListCompanyInvoicesHandler } from "./application/queries/list-company-invoices.handler.js";
import { ListMyCompanyInvoicesHandler } from "./application/queries/list-my-company-invoices.handler.js";
import { InvoiceDocumentRenderer } from "./application/services/invoice-document-renderer.js";
import { InvoiceNoticeSender } from "./application/services/invoice-notice-sender.js";
import { CompanyInvoicesReader } from "./domain/ports/company-invoices.reader.js";
import { InvoiceFontSource } from "./domain/ports/invoice-font-source.js";
import { InvoiceMailOrigins } from "./domain/ports/invoice-mail-origins.js";
import { InvoicePeriodsReader } from "./domain/ports/invoice-periods.reader.js";
import { InvoiceSiteContactsReader } from "./domain/ports/invoice-site-contacts.reader.js";
import { PrismaCompanyInvoicesReader } from "./infrastructure/prisma-company-invoices.reader.js";
import { DiskInvoiceFontSource } from "./infrastructure/disk-invoice-font-source.js";
import { PrismaInvoicePeriodsReader } from "./infrastructure/prisma-invoice-periods.reader.js";
import { PrismaInvoiceSiteContactsReader } from "./infrastructure/prisma-invoice-site-contacts.reader.js";

/**
 * Les providers des lots E6 et E3b (plan `facture-emise.md`) :
 * prévenir à l'émission, « Mes factures », l'onglet de la fiche, et le PDF/A-3
 * Factur-X de chaque pièce. À part du module, qui dépassait déjà la taille
 * d'un fichier.
 */
export const ISSUED_INVOICE_PROVIDERS: readonly Provider[] = [
  { provide: CompanyInvoicesReader, useClass: PrismaCompanyInvoicesReader },
  { provide: InvoicePeriodsReader, useClass: PrismaInvoicePeriodsReader },
  { provide: InvoiceSiteContactsReader, useClass: PrismaInvoiceSiteContactsReader },
  {
    provide: InvoiceMailOrigins,
    inject: [AppConfig],
    useFactory: (config: AppConfig): InvoiceMailOrigins => ({
      clientBaseUrl: () => config.clientBaseUrl(),
    }),
  },
  { provide: InvoiceFontSource, useClass: DiskInvoiceFontSource },
  InvoiceDocumentRenderer,
  InvoiceNoticeSender,
  SendInvoiceNotice,
  ResendInvoiceNoticeHandler,
  RenderCreditNoteDocument,
  GetIssuedInvoiceDocumentHandler,
  GetMyCompanyInvoiceDocumentHandler,
  ListMyCompanyInvoicesHandler,
  GetMyCompanyInvoiceHandler,
  ListCompanyInvoicesHandler,
  GetIssuedInvoiceHandler,
];

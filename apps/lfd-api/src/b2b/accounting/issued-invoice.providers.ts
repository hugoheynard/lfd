import type { Provider } from "@nestjs/common";

import { AppConfig } from "../../platform/config/app-config.js";
import { SendInvoiceNotice } from "./application/handlers/send-invoice-notice.handler.js";
import { GetIssuedInvoiceHandler } from "./application/queries/get-issued-invoice.handler.js";
import { GetMyCompanyInvoiceHandler } from "./application/queries/get-my-company-invoice.handler.js";
import { ListCompanyInvoicesHandler } from "./application/queries/list-company-invoices.handler.js";
import { ListMyCompanyInvoicesHandler } from "./application/queries/list-my-company-invoices.handler.js";
import { InvoiceNoticeSender } from "./application/services/invoice-notice-sender.js";
import { InvoiceMailOrigins } from "./domain/ports/invoice-mail-origins.js";
import { InvoicePeriodsReader } from "./domain/ports/invoice-periods.reader.js";
import { InvoiceSiteContactsReader } from "./domain/ports/invoice-site-contacts.reader.js";
import { PrismaInvoicePeriodsReader } from "./infrastructure/prisma-invoice-periods.reader.js";
import { PrismaInvoiceSiteContactsReader } from "./infrastructure/prisma-invoice-site-contacts.reader.js";

/**
 * Les providers du lot E6 (plan `plan-emission-de-la-facture.md`) : prévenir
 * à l'émission, « Mes factures », l'onglet de la fiche. À part du module,
 * qui dépassait déjà la taille d'un fichier.
 */
export const ISSUED_INVOICE_PROVIDERS: readonly Provider[] = [
  { provide: InvoicePeriodsReader, useClass: PrismaInvoicePeriodsReader },
  { provide: InvoiceSiteContactsReader, useClass: PrismaInvoiceSiteContactsReader },
  {
    provide: InvoiceMailOrigins,
    inject: [AppConfig],
    useFactory: (config: AppConfig): InvoiceMailOrigins => ({
      clientBaseUrl: () => config.clientBaseUrl(),
    }),
  },
  InvoiceNoticeSender,
  SendInvoiceNotice,
  ListMyCompanyInvoicesHandler,
  GetMyCompanyInvoiceHandler,
  ListCompanyInvoicesHandler,
  GetIssuedInvoiceHandler,
];

import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { COMMERCIAL_INVOICE } from "../domain/entities/invoice.types.js";
import {
  ChorusInvoicesReader,
  type ChorusInvoicesFilter,
  type ChorusListedInvoice,
} from "../domain/ports/chorus-invoices.reader.js";
import { isPublicInvoice } from "../domain/services/public-invoice-due.js";
import {
  CHORUS_INVOICE_SELECT,
  chorusListedOf,
  PUBLIC_BUYER_WHERE,
} from "./chorus-deposit-rows.js";

/**
 * La page « Chorus Pro » (T4′), une requête par onglet. La nature publique se
 * lit sur la forme juridique figée de l'acheteur, rejugée par le domaine.
 */
@Injectable()
export class PrismaChorusInvoicesReader extends ChorusInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async toDeposit(filter: ChorusInvoicesFilter): Promise<readonly ChorusListedInvoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        ...this.base(filter),
        chorusDeposits: { none: {} },
        creditNotes: { none: {} },
      },
      orderBy: [{ issuedOn: "asc" }, { number: "asc" }],
      select: CHORUS_INVOICE_SELECT,
    });
    return rows.map(chorusListedOf).filter((invoice) => isPublicInvoice(invoice));
  }

  async deposited(filter: ChorusInvoicesFilter): Promise<readonly ChorusListedInvoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { ...this.base(filter), chorusDeposits: { some: { kind: "deposited" } } },
      orderBy: { number: "desc" },
      select: CHORUS_INVOICE_SELECT,
    });
    return rows
      .map(chorusListedOf)
      .filter((invoice) => isPublicInvoice(invoice))
      .sort((a, b) => (b.standing.depositedOn ?? "").localeCompare(a.standing.depositedOn ?? ""));
  }

  private base(filter: ChorusInvoicesFilter) {
    return {
      type: COMMERCIAL_INVOICE,
      ...PUBLIC_BUYER_WHERE,
      ...(filter.legalEntityId === null ? {} : { legalEntityId: filter.legalEntityId }),
    };
  }
}

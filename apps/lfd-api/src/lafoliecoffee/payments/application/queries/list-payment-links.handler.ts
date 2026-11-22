import type { PaymentLinkView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PayLinks } from "../../../../payment/channels/requests/index.js";
import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import {
  PaymentLinkReader,
  type PaymentLinkEntry,
} from "../../domain/ports/payment-link.reader.js";
import { freeChargeSubject } from "../free-charge/free-charge-subject.js";
import { ListPaymentLinksQuery } from "./list-payment-links.query.js";

/**
 * Les liens libres, auteurs nommés par l'annuaire et adresses servies — en
 * une lecture pour toute la liste, pas une par ligne. Une fiche inconnue rend
 * `null`, jamais un nom inventé.
 *
 * **Une ligne a une adresse si son lien est ouvert** : la colonne pour un
 * lien d'avant la porte, `PayLinks.urlsOf` pour une demande de paiement libre payée par
 * la porte. Une adresse qui ne se compose pas (racine publique absente) laisse
 * sa ligne à `null` — `urlsOf` l'a journalisé — sans faire tomber la liste.
 */
@QueryHandler(ListPaymentLinksQuery)
export class ListPaymentLinksHandler implements IQueryHandler<
  ListPaymentLinksQuery,
  readonly PaymentLinkView[]
> {
  constructor(
    private readonly reader: PaymentLinkReader,
    private readonly authors: StaffAuthorDirectory,
    private readonly payLinks: PayLinks,
  ) {}

  async execute(): Promise<readonly PaymentLinkView[]> {
    const entries = await this.reader.list();
    const authors = await this.authors.identify(
      entries.flatMap((entry) => [entry.createdByStaffId, entry.cancelledByStaffId]),
    );
    const doorUrls = await this.doorUrls(entries);
    return entries.map((entry) => toView(entry, authors, urlOf(entry, doorUrls)));
  }

  /** Les adresses des demandes de paiement libres ouvertes payées par la porte, par id. */
  private async doorUrls(
    entries: readonly PaymentLinkEntry[],
  ): Promise<ReadonlyMap<string, string>> {
    const open = entries.filter((entry) => entry.status === "open" && entry.checkoutUrl === null);
    const urls = await this.payLinks.urlsOf(open.map((entry) => freeChargeSubject(entry.id)));
    return new Map(urls.map(({ subject, url }) => [subject.id, url]));
  }
}

function urlOf(entry: PaymentLinkEntry, doorUrls: ReadonlyMap<string, string>): string | null {
  if (entry.status !== "open") {
    return null;
  }
  return entry.checkoutUrl ?? doorUrls.get(entry.id) ?? null;
}

function toView(
  entry: PaymentLinkEntry,
  authors: StaffAuthors,
  url: string | null,
): PaymentLinkView {
  return {
    id: entry.id,
    companyId: entry.companyId,
    companyName: entry.companyName,
    amountCents: entry.amountCents,
    label: entry.label,
    status: entry.status,
    url,
    createdAt: entry.createdAt.toISOString(),
    createdByName: authors.nameOf(entry.createdByStaffId),
    paidAt: entry.paidAt?.toISOString() ?? null,
    cancelledAt: entry.cancelledAt?.toISOString() ?? null,
    cancelledByName: authors.nameOf(entry.cancelledByStaffId),
  };
}

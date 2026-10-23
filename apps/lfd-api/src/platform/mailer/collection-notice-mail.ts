import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, mailCopyOf } from "./copy/mail-copy.js";
import type { CollectionNoticeCopy, CollectionNoticeKind } from "./copy/mail-copy.model.js";

/** Ce que l'avis annonce — le gabarit choisit ses mots en fonction. */
export type CollectionNoticeMailKind = CollectionNoticeKind;

/**
 * Les données de l'**avis de prélèvement** (pré-notification SEPA, plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA2).
 * Destinataire : le contact de facturation de la société payeuse, ou son
 * détenteur. Tout est déjà mis en forme : le gabarit ne calcule rien.
 */
export interface CollectionNoticeMailData {
  readonly kind: CollectionNoticeMailKind;
  readonly creditorName: string;
  /** L'ICS — il se déclare avec la RUM, et c'est lui que la banque affiche. */
  readonly creditorIdentifier: string;
  readonly debtorName: string;
  /** Le montant, en euros, déjà formaté (« 1 234,56 € »). */
  readonly amount: string;
  /** La date du prélèvement, en toutes lettres (« jeudi 15 octobre 2026 »). */
  readonly collectionDay: string;
  /** La RUM du mandat. */
  readonly mandateReference: string;
  /** La référence de l'arrêté de facturation ; vide pour une annulation et une ligne de factures. */
  readonly statementReference: string;
  /** Les factures que la ligne encaisse (E4) ; vide pour une ligne d'arrêté. */
  readonly invoiceNumbers: readonly string[];
  /**
   * Le jour du prélèvement rejeté que celui-ci présente de nouveau, en toutes
   * lettres (plan `retours-bancaires.md`) ; `null` sinon.
   */
  readonly representedRejectionDay: string | null;
  /** Pour un rectificatif : ce qu'annonçait l'avis précédent. */
  readonly previous: { readonly amount: string; readonly collectionDay: string } | null;
}

/** La coquille client, prêtée par le registre. */
export type NoticeShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu, à part de `mail-templates.ts` : le registre n'en garde qu'une
 * ligne. Sobre : un montant, une date, les deux références que le payeur
 * rapprochera de son relevé (RUM, ICS), et celle de la pièce réglée — ses
 * factures (E4), ou l'arrêté d'un lot d'avant. Les mots viennent du
 * dictionnaire (`customer.collection-notice`), dans la langue de repli : rien
 * ne porte encore la langue d'un payeur.
 */
export function renderCollectionNoticeMail(
  data: CollectionNoticeMailData,
  shell: NoticeShell,
): RenderedMail {
  const copy = mailCopyOf(DEFAULT_MAIL_LOCALE)["customer.collection-notice"];
  const title = copy.title[data.kind];
  return {
    subject: sanitiseSubject(
      fill(copy.subject, { title, creditor: data.creditorName, day: data.collectionDay }),
    ),
    html: shell({
      title,
      body: bodyOf(data, copy),
      rows: rowsOf(data, copy),
      footer: copy.footer,
    }),
  };
}

function bodyOf(data: CollectionNoticeMailData, copy: CollectionNoticeCopy): string {
  if (data.kind === "cancellation") {
    const cancelled = fill(copy.cancelled, {
      amount: data.amount,
      day: data.collectionDay,
      debtor: data.debtorName,
    });
    return `${copy.greeting}\n\n${cancelled}`;
  }
  const announced = fill(copy.announced, {
    creditor: data.creditorName,
    amount: data.amount,
    debtor: data.debtorName,
    day: data.collectionDay,
    pieces: settledPieces(data, copy),
  });
  const sentences = [
    ...(data.kind === "correction" ? [copy.correctionLead] : []),
    ...(data.representedRejectionDay === null
      ? []
      : [fill(copy.representationLead, { day: data.representedRejectionDay })]),
    announced,
  ];
  return `${copy.greeting}\n\n${sentences.join(" ")}`;
}

/** Ce que le prélèvement règle : des factures émises (E4), ou l'arrêté d'avant. */
function settledPieces(data: CollectionNoticeMailData, copy: CollectionNoticeCopy): string {
  const numbers = data.invoiceNumbers;
  if (numbers.length === 0) {
    return fill(copy.piecesStatement, { statement: data.statementReference });
  }
  return numbers.length === 1
    ? fill(copy.piecesOneInvoice, { number: numbers.join("") })
    : fill(copy.piecesInvoices, { numbers: numbers.join(", ") });
}

function pieceRow(data: CollectionNoticeMailData, copy: CollectionNoticeCopy): LayoutRow {
  const numbers = data.invoiceNumbers;
  if (numbers.length === 0) {
    return { label: copy.statementLabel, value: data.statementReference };
  }
  return {
    label: numbers.length === 1 ? copy.invoiceLabel : copy.invoicesLabel,
    value: numbers.join(", "),
  };
}

function rowsOf(data: CollectionNoticeMailData, copy: CollectionNoticeCopy): readonly LayoutRow[] {
  const references: LayoutRow[] = [
    { label: copy.creditorLabel, value: data.creditorName },
    { label: copy.creditorIdentifierLabel, value: data.creditorIdentifier },
    { label: copy.mandateReferenceLabel, value: data.mandateReference },
  ];
  if (data.kind === "cancellation") {
    return [
      { label: copy.cancelledAmountLabel, value: data.amount },
      { label: copy.announcedDayLabel, value: data.collectionDay },
      ...references,
    ];
  }
  return [
    ...(data.previous === null
      ? []
      : [
          {
            label: copy.previousLabel,
            value: fill(copy.previousValue, {
              amount: data.previous.amount,
              day: data.previous.collectionDay,
            }),
          },
        ]),
    { label: copy.collectionDayLabel, value: data.collectionDay },
    ...(data.representedRejectionDay === null
      ? []
      : [{ label: copy.representationLabel, value: data.representedRejectionDay }]),
    ...references,
    pieceRow(data, copy),
    { label: copy.amountLabel, value: data.amount, strong: true },
  ];
}

import type { ClientSheet, ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import type { OrderCancelledCopy } from "./copy/mail-copy.model.js";
import { fill, mailCopyOf } from "./copy/mail-copy.js";

/**
 * Les données de l'e-mail **« Votre commande a été annulée par notre
 * équipe »** (plan `documentation/commandes/annulation/plan-annulation-de-commande.md`,
 * C3.5). Destinataire : la personne qui a passé la commande.
 *
 * Ni QR — une commande annulée ne se retire pas —, ni motif — il est interne.
 */
export interface OrderCancelledMailData {
  readonly sheet: ClientSheet;
  /**
   * `free` : total nul ; `due` : carte non payée, fermée chez Stripe ;
   * `account` : au compte, ni facturée ni prélevée (lot C5) ; `paid` : payée
   * par carte, remboursée (lot C4).
   */
  readonly regime: "free" | "due" | "account" | "paid";
  /**
   * Lot C4 (C4.8) : ce qui sera rendu sur la carte, en centimes TTC — `null`
   * hors `paid`, ou quand le paiement a déjà été rendu en entier. Absent des
   * envois d'avant C4 : lu `null`.
   */
  readonly refund?: { readonly announcedCents: number } | null;
  /**
   * Ce que l'annulation a fait du bon de fidélité (lot C3b) — `null` sans bon.
   * `lapsed` (bon échu) n'est pas annoncé : le courriel se tait sur un bon
   * qui ne revient pas (Q2), au lieu de dire « rendu » pour un bon mort.
   */
  readonly voucher: {
    readonly outcome: "returned" | "merged" | "lapsed";
    /** Centimes HT, l'unité du bon. */
    readonly voucherValueCents: number;
    readonly remainderValueCents: number | null;
    /** Instant ISO 8601 : la date limite d'origine du bon. */
    readonly expiresAt: string;
  } | null;
  /**
   * Lot C6 (C6.9) : qui a annulé, pour la phrase d'ouverture. Absent ou
   * `team` : « annulée par notre équipe », comme avant C6. `self` : le client
   * lui-même (ou l'invité). `member` : un autre membre de la société — son
   * nom (« Prénom N. ») et la société. Le motif n'y figure jamais.
   */
  readonly author?:
    | { readonly kind: "team" }
    | { readonly kind: "self" }
    | { readonly kind: "member"; readonly name: string; readonly company: string };
  readonly locale: ContentLocale;
}

/** La coquille client, prêtée par le registre. */
export type OrderCancelledShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/** Le rendu, à part de `mail-templates.ts`, comme la facture émise. */
export function renderOrderCancelledMail(
  data: OrderCancelledMailData,
  shell: OrderCancelledShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale).orderCancelled;
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref: data.sheet.reference })),
    html: shell({ title: copy.title, body: bodyOf(data, copy), footer: copy.footer }),
  };
}

/** Ce que le courriel dit de l'argent, par régime. */
const MONEY_SENTENCE: Readonly<
  Record<
    OrderCancelledMailData["regime"],
    (copy: OrderCancelledCopy, data: OrderCancelledMailData) => string
  >
> = {
  free: (copy) => copy.nothingBilled,
  due: (copy) => copy.nothingCharged,
  account: (copy) => copy.nothingInvoiced,
  paid: (copy, data) => {
    const refund = data.refund ?? null;
    return refund === null
      ? copy.alreadyRefunded
      : fill(copy.refundToCard, { amount: euros(refund.announcedCents, data.locale) });
  },
};

function bodyOf(data: OrderCancelledMailData, copy: OrderCancelledCopy): string {
  const ref = data.sheet.reference;
  const day = dayInWords(data.sheet.requestedFor, data.locale);
  const intro = introOf(data, copy, ref, day);
  const money = MONEY_SENTENCE[data.regime](copy, data);
  const voucher = voucherSentenceOf(data, copy);
  return `${intro}\n\n${money}${voucher === null ? "" : `\n\n${voucher}`}`;
}

/** La phrase d'ouverture, selon qui a annulé (C6.9). */
function introOf(
  data: OrderCancelledMailData,
  copy: OrderCancelledCopy,
  ref: string,
  day: string | null,
): string {
  const author = data.author ?? { kind: "team" };
  switch (author.kind) {
    case "team":
      return day === null ? fill(copy.introWithoutDay, { ref }) : fill(copy.intro, { ref, day });
    case "self":
      return day === null
        ? fill(copy.introBySelfWithoutDay, { ref })
        : fill(copy.introBySelf, { ref, day });
    case "member": {
      const who = { name: author.name, company: author.company, ref };
      return day === null
        ? fill(copy.introByMemberWithoutDay, who)
        : fill(copy.introByMember, { ...who, day });
    }
  }
}

function voucherSentenceOf(data: OrderCancelledMailData, copy: OrderCancelledCopy): string | null {
  const voucher = data.voucher;
  if (voucher === null || voucher.outcome === "lapsed") {
    return null;
  }
  const value = euros(voucher.voucherValueCents, data.locale);
  const day = new Intl.DateTimeFormat(data.locale, {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  }).format(new Date(voucher.expiresAt));
  if (voucher.outcome === "merged" && voucher.remainderValueCents !== null) {
    const remainder = euros(voucher.remainderValueCents, data.locale);
    return fill(copy.voucherMerged, { value, day, remainder });
  }
  return fill(copy.voucherReturned, { value, day });
}

function euros(cents: number, locale: ContentLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

/**
 * « mardi 13 octobre » — le jour de service, qui n'a ni heure ni fuseau : il
 * est lu et écrit en UTC, sans quoi un serveur à l'ouest le reculerait d'un
 * jour. `null` sur une commande sans jour, ou d'un jour illisible.
 */
function dayInWords(requestedFor: string | null, locale: ContentLocale): string | null {
  if (requestedFor === null) {
    return null;
  }
  const date = new Date(`${requestedFor.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

import type { ClientSheet, ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import type { OrderCancelledCopy } from "./copy/mail-copy.model.js";
import { fill, mailCopyOf } from "./copy/mail-copy.js";

/**
 * Les données de l'e-mail **« Votre commande a été annulée par notre
 * équipe »** (plan `documentation/order/plan-annulation-de-commande.md`,
 * C3.5). Destinataire : la personne qui a passé la commande.
 *
 * Ni QR — une commande annulée ne se retire pas —, ni motif — il est interne.
 */
export interface OrderCancelledMailData {
  readonly sheet: ClientSheet;
  /** `free` : total nul ; `due` : carte non payée, fermée chez Stripe. */
  readonly regime: "free" | "due";
  /** Un bon de fidélité utilisé a été rendu avec l'annulation. */
  readonly voucherReturned: boolean;
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

function bodyOf(data: OrderCancelledMailData, copy: OrderCancelledCopy): string {
  const ref = data.sheet.reference;
  const day = dayInWords(data.sheet.requestedFor, data.locale);
  const intro = day === null ? fill(copy.introWithoutDay, { ref }) : fill(copy.intro, { ref, day });
  const money = data.regime === "free" ? copy.nothingBilled : copy.nothingCharged;
  const voucher = data.voucherReturned ? `\n\n${copy.voucherReturned}` : "";
  return `${intro}\n\n${money}${voucher}`;
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

import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";

/**
 * Les données des deux e-mails qui RÉPONDENT à une demande de modification
 * (plan `documentation/commandes/modification/plan-modifier-une-commande.md`, M4) :
 * appliquée, ou refusée avec le mot de l'équipe. Destinataire : l'auteur de
 * la demande, à l'adresse de son compte.
 *
 * Pas de lignes : la commande à jour se relit dans l'espace du client. Le
 * courriel « appliquée » porte en revanche le nouveau total et l'écart avec
 * l'ancien (décision de Hugo, 2026-10-23, plan §14) — lus sur la révision
 * appliquée, jamais recalculés ici : c'est ce que la boutique promet au
 * moment d'envoyer la demande (« le nouveau total vous est confirmé par
 * e-mail »).
 */
export interface OrderChangeAppliedMailData {
  /** Le numéro de la commande. */
  readonly reference: string;
  /** Total TTC après la révision, en centimes. */
  readonly totalCents: number;
  /** Total TTC avant la révision, en centimes. */
  readonly previousTotalCents: number;
  readonly locale: ContentLocale;
}

export interface OrderChangeRefusedMailData {
  readonly reference: string;
  /** Le mot de l'équipe, tel qu'il a été écrit. */
  readonly reason: string;
  readonly locale: ContentLocale;
}

/** La coquille client, prêtée par le registre. */
export type OrderChangeAnswerShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/** « Votre modification est faite. » */
export function renderOrderChangeAppliedMail(
  data: OrderChangeAppliedMailData,
  shell: OrderChangeAnswerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-change-applied"];
  const ref = data.reference;
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref })),
    html: shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${fill(copy.intro, { ref })}\n\n${totalShift(data)}\n\n${copy.where}`,
      rows: [{ label: copy.totalLabel, value: euros(data.totalCents, data.locale), strong: true }],
      footer: copy.footer,
    }),
  };
}

/** L'écart entre les deux totaux, dit dans le sens où il va. */
function totalShift(data: OrderChangeAppliedMailData): string {
  const copy = mailCopyOf(data.locale)["customer.order-change-applied"];
  const shift = data.totalCents - data.previousTotalCents;
  if (shift === 0) {
    return copy.sameTotal;
  }
  const previous = euros(data.previousTotalCents, data.locale);
  const amount = euros(Math.abs(shift), data.locale);
  return fill(shift > 0 ? copy.moreToPay : copy.lessToPay, { amount, previous });
}

/** Un montant en centimes, dans la langue du destinataire — comme les autres courriels de commande. */
function euros(cents: number, locale: ContentLocale): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
}

/** « Nous n'avons pas pu modifier votre commande », avec le mot de l'équipe. */
export function renderOrderChangeRefusedMail(
  data: OrderChangeRefusedMailData,
  shell: OrderChangeAnswerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-change-refused"];
  const ref = data.reference;
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref })),
    html: shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${fill(copy.intro, { ref })}\n\n${copy.contactSales}`,
      rows: [{ label: copy.reasonLabel, value: data.reason }],
    }),
  };
}

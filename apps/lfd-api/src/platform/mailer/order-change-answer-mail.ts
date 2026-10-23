import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";

/**
 * Les données des deux e-mails qui RÉPONDENT à une demande de modification
 * (plan `documentation/commandes/plan-modifier-une-commande.md`, M4) :
 * appliquée, ou refusée avec le mot de l'équipe. Destinataire : l'auteur de
 * la demande, à l'adresse de son compte.
 *
 * Ni montant ni lignes : la commande à jour se relit dans l'espace du client,
 * et un récapitulatif ici dirait une seconde vérité.
 */
export interface OrderChangeAppliedMailData {
  /** Le numéro de la commande. */
  readonly reference: string;
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
      body: `${fill(copy.intro, { ref })}\n\n${copy.where}`,
      footer: copy.footer,
    }),
  };
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
      body: `${fill(copy.intro, { ref })}\n\n${copy.unchanged}`,
      rows: [{ label: copy.reasonLabel, value: data.reason }],
      footer: copy.footer,
    }),
  };
}

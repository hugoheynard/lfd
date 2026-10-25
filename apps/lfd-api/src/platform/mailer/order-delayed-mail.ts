import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";

/**
 * Les données du courriel **« Votre commande prend du retard »** — le geste
 * « Avertir le client » de la Supervision (Hugo, 2026-10-25). Destinataire :
 * le client qui a passé la commande.
 */
export interface OrderDelayedMailData {
  /** Le numéro de commande, que le client retrouve dans son espace. */
  readonly reference: string;
  /** Le point de retrait figé à la commande ; `null` = pas de ligne « À retirer ». */
  readonly pickupLabel: string | null;
  /** L'app cliente, pour « voir ma commande ». Vide = pas de bouton. */
  readonly orderUrl: string;
  readonly locale: ContentLocale;
}

/** La coquille client, prêtée par le registre : l'enseigne y est déjà posée. */
export type OrderDelayedShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu. Ce qu'il ne dit PAS, et c'est délibéré : aucune heure — on ne sait
 * pas quand elle sera prête, et le courriel « prête » le dira le moment venu.
 * Ni QR : rien n'est à retirer tant qu'elle ne l'est pas.
 */
export function renderOrderDelayedMail(
  data: OrderDelayedMailData,
  shell: OrderDelayedShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-delayed"];
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref: data.reference })),
    html: shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${copy.intro}\n\n${copy.apology}`,
      rows: [
        { label: copy.referenceLabel, value: data.reference },
        ...(data.pickupLabel === null ? [] : [{ label: copy.whereLabel, value: data.pickupLabel }]),
      ],
      ...(data.orderUrl === "" ? {} : { cta: { label: copy.cta, url: data.orderUrl } }),
      footer: copy.footer,
    }),
  };
}

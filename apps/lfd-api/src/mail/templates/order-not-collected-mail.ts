import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { fill, mailCopyOf } from "./copy/mail-copy.js";
import type { MailBody } from "./mail-logo.js";

/**
 * Les données du courriel **« Votre commande n'a pas été retirée »** — le
 * geste « Prévenir le client », décidé par la supervision du comptoir après
 * qu'une commande à régler en boutique a été déclarée non retirée
 * (`plan-commande-particulier-reglee-en-boutique.md`, § 5 bis). Destinataire :
 * le client de la commande.
 */
export interface OrderNotCollectedMailData {
  /** Le numéro de commande, que le client retrouve sur sa confirmation. */
  readonly reference: string;
  /** Le point de retrait figé à la commande ; `null` = pas de ligne « Point de retrait ». */
  readonly pickupLabel: string | null;
  readonly locale: ContentLocale;
}

/** La coquille client, prêtée par le registre : l'enseigne y est déjà posée. */
export type OrderNotCollectedShell = (
  input: Omit<LayoutInput, "brand" | "supportEmail">,
) => MailBody;

/**
 * Le rendu. Ce qu'il ne dit PAS, et c'est délibéré : aucun montant, aucune
 * somme due, aucun moyen de paiement — rien n'a été encaissé, et notre système
 * ne réclame rien pour une commande à régler en boutique. Ni bouton : la sortie
 * est de contacter la boutique.
 */
export function renderOrderNotCollectedMail(
  data: OrderNotCollectedMailData,
  shell: OrderNotCollectedShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.order-not-collected"];
  return {
    subject: sanitiseSubject(fill(copy.subject, { ref: data.reference })),
    ...shell({
      kicker: copy.kicker,
      title: copy.title,
      body: `${copy.intro}\n\n${copy.contact}`,
      rows: [
        { label: copy.referenceLabel, value: data.reference },
        ...(data.pickupLabel === null ? [] : [{ label: copy.whereLabel, value: data.pickupLabel }]),
      ],
    }),
  };
}

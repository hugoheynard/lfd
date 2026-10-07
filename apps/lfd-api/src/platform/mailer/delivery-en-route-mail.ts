import type { ContentLocale } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { mailCopyOf } from "./copy/mail-copy.js";

/**
 * Les données du courriel **« Votre livraison est en route »**
 * (`documentation/livraisons/livreur/en-route.md`, PL3-D4). Destinataire : le
 * compte qui a commandé, tant que le contact de livraison n'a pas d'e-mail
 * (L6-C13).
 */
export interface DeliveryEnRouteMailData {
  /** Le numéro de commande, que le client retrouve dans son espace. */
  readonly reference: string;
  /** Les lignes de l'adresse servie, déjà composées. Vide = pas de ligne d'adresse. */
  readonly addressLines: readonly string[];
  /** L'app cliente, pour « voir ma commande ». Vide = pas de bouton. */
  readonly orderUrl: string;
  readonly locale: ContentLocale;
}

/** La coquille client, prêtée par le registre : l'enseigne y est déjà posée. */
export type CustomerShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu, à part de `mail-templates.ts` pour ne pas l'alourdir : le registre
 * n'en garde qu'une ligne.
 *
 * Ce qu'il ne dit PAS, et c'est délibéré : aucune heure d'arrivée (on n'en a
 * pas d'estimation fiable par arrêt), ni nom ni téléphone du livreur.
 */
export function renderDeliveryEnRouteMail(
  data: DeliveryEnRouteMailData,
  shell: CustomerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale).deliveryEnRoute;
  const address = data.addressLines.filter((line) => line !== "").join(", ");
  return {
    subject: sanitiseSubject(copy.subject),
    html: shell({
      title: copy.title,
      body: `${copy.intro}\n\n${data.reference}`,
      rows: [
        { label: copy.referenceLabel, value: data.reference },
        ...(address === "" ? [] : [{ label: copy.addressLabel, value: address }]),
      ],
      ...(data.orderUrl === "" ? {} : { cta: { label: copy.cta, url: data.orderUrl } }),
      footer: copy.footer,
    }),
  };
}

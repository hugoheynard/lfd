import type { ContentLocale, FulfillmentWindow } from "@lfd/contracts";
import { sanitiseSubject, type LayoutInput, type RenderedMail } from "@lfd/mailer";

import { mailCopyOf } from "./copy/mail-copy.js";
import type { DeliveryEnRouteCopy } from "./copy/model/order-mails.model.js";
import { windowInWords } from "./fulfillment-window-in-words.js";

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
  /** Le créneau choisi à la commande, dit à la suite de l'adresse. `null` = aucun. */
  readonly window: FulfillmentWindow | null;
  /** L'app cliente, pour « voir ma commande ». Vide = pas de bouton. */
  readonly orderUrl: string;
  readonly locale: ContentLocale;
  /**
   * L'envoi de rang > 1 part (plan E7 reliquat, choix 17) : le courriel dit
   * « le reste de votre commande ». Absent = le premier envoi, inchangé.
   */
  readonly remainder?: boolean;
}

/** La coquille client, prêtée par le registre : l'enseigne y est déjà posée. */
export type CustomerShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

/**
 * Le rendu, à part de `mail-templates.ts` pour ne pas l'alourdir : le registre
 * n'en garde qu'une ligne.
 *
 * Ce qu'il ne dit PAS, et c'est délibéré : aucune heure d'arrivée ESTIMÉE (on
 * n'en a pas d'estimation fiable par arrêt), ni nom ni téléphone du livreur.
 * Le seul horaire est le créneau que le client a choisi, à la suite de
 * l'adresse : « Livrée à …, entre 07:00 et 09:00 » (Hugo, 2026-10-28).
 */
export function renderDeliveryEnRouteMail(
  data: DeliveryEnRouteMailData,
  shell: CustomerShell,
): RenderedMail {
  const copy = mailCopyOf(data.locale)["customer.delivery-en-route"];
  const remainder = data.remainder === true;
  const address = addressWithWindow(data, copy);
  return {
    subject: sanitiseSubject(remainder ? copy.subjectRemainder : copy.subject),
    html: shell({
      kicker: copy.kicker,
      title: remainder ? copy.titleRemainder : copy.title,
      body: `${remainder ? copy.introRemainder : copy.intro}\n\n${data.reference}`,
      rows: [
        { label: copy.referenceLabel, value: data.reference },
        ...(address === "" ? [] : [{ label: copy.addressLabel, value: address }]),
      ],
      ...(data.orderUrl === "" ? {} : { cta: { label: copy.cta, url: data.orderUrl } }),
    }),
  };
}

/** « 12 rue des Pistes, 73150 Val d'Isère, entre 07:00 et 09:00 » — vide sans adresse. */
function addressWithWindow(data: DeliveryEnRouteMailData, copy: DeliveryEnRouteCopy): string {
  const address = data.addressLines.filter((line) => line !== "").join(", ");
  const slot = windowInWords(data.window, copy);
  return address === "" || slot === null ? address : `${address}, ${slot}`;
}

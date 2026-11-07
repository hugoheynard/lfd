import type { ClientSheet, ContentLocale } from "@lfd/contracts";
import type { MailPreviewSituation } from "@lfd/mail-blocks";

import type { B2bMails } from "../../mail-templates.js";
import { specimenDataOf } from "../mail-specimens.js";
import { delivered } from "./order-specimen-cases.js";

/** Les données d'un e-mail qui portent une feuille de commande. */
type SheetMail = {
  readonly [K in keyof B2bMails]: B2bMails[K] extends { readonly sheet: ClientSheet } ? K : never;
}[keyof B2bMails];

/** Comment passer les données d'un cas dans une situation. */
type SituationShift<K extends keyof B2bMails> = Readonly<
  Record<MailPreviewSituation, (data: B2bMails[K], locale: ContentLocale) => B2bMails[K]>
>;

/** Retirée au point de retrait de l'exemple de l'e-mail : son adresse, son site. */
function pickedUp<K extends SheetMail>(mail: K): SituationShift<K>["pickup"] {
  return (data, locale) => ({
    ...data,
    sheet: { ...data.sheet, fulfillment: specimenDataOf(mail, locale).sheet.fulfillment },
  });
}

/** Les deux situations d'un e-mail de commande : le cas, en retrait ou en livraison. */
function byFulfillment<K extends SheetMail>(mail: K): SituationShift<K> {
  return {
    pickup: pickedUp(mail),
    delivery: (data) => ({ ...data, sheet: delivered(data.sheet) }),
  };
}

/**
 * **Les situations de l'aperçu** (plan `plan-editeur-par-blocs.md`, § 24,
 * conditions d'affichage, 2026-11-07) : les e-mails dont un bloc dépend du
 * mode de retrait — l'itinéraire, rendu seulement pour un retrait
 * (`pickupItinerary`). Le cas courant est passé en retrait ou en livraison ;
 * aucun cas n'est dupliqué, et le reste de ses données ne bouge pas (un cas
 * sans jeton de retrait reste sans QR). La garde tient la liste : un e-mail
 * dont aucun bloc ne change d'une situation à l'autre n'y a pas sa place.
 */
export const MAIL_SITUATIONS: { readonly [K in keyof B2bMails]?: SituationShift<K> } = {
  "customer.order-placed": byFulfillment("customer.order-placed"),
  "customer.order-ready": byFulfillment("customer.order-ready"),
};

/** Les situations que l'aperçu sait rendre pour cet e-mail ; vide s'il n'en dépend pas. */
export function mailSituationsOf(mail: keyof B2bMails): readonly MailPreviewSituation[] {
  return MAIL_SITUATIONS[mail] === undefined ? [] : ["pickup", "delivery"];
}

/** Les données d'un cas dans une situation ; `null` : l'e-mail n'a pas de situation. */
export function situatedDataOf<K extends keyof B2bMails>(
  mail: K,
  data: B2bMails[K],
  situation: MailPreviewSituation,
  locale: ContentLocale,
): B2bMails[K] | null {
  const shift: SituationShift<K> | undefined = MAIL_SITUATIONS[mail];
  return shift === undefined ? null : shift[situation](data, locale);
}

import type { ContentLocale } from "@lfd/contracts";
import type { RenderedMail, TemplateRegistry } from "@lfd/mailer";

import { withMailCopyOverlay, type MailCopyOverlay } from "../copy/mail-copy-overlay.js";
import type { B2bMails } from "../mail-templates.js";
import {
  NO_MAIL_LAYOUT,
  withMailLayout,
  type MailLayoutScope,
} from "../sections/mail-layout-scope.js";
import { CUSTOMER_SPECIMENS } from "./customer-specimens.js";
import type { MailFamily, MailSpecimens } from "./mail-specimen.types.js";
import { ORDER_CHANGE_SPECIMENS } from "./order-change-specimens.js";
import { ORDER_SPECIMENS } from "./order-specimens.js";
import { TEAM_SPECIMENS } from "./team-specimens.js";

export type { MailFamily } from "./mail-specimen.types.js";

/**
 * **Un exemple par e-mail du registre** (plan `plan-textes-des-e-mails.md`,
 * C6) — les données que l'aperçu et l'essai passent au VRAI gabarit.
 *
 * 🔴 Ce ne sont que des données : elles ne sont lues d'aucune base et n'en
 * touchent aucune. L'aperçu les rend, l'essai les envoie à la seule adresse
 * de la personne qui le demande.
 */
export const MAIL_SPECIMENS: MailSpecimens = {
  ...ORDER_SPECIMENS,
  ...CUSTOMER_SPECIMENS,
  ...TEAM_SPECIMENS,
  ...ORDER_CHANGE_SPECIMENS,
};

/** Une clé du registre ? Une chaîne venue d'une route ne l'est pas d'office. */
export function isMailKey(candidate: string): candidate is keyof B2bMails {
  return Object.hasOwn(MAIL_SPECIMENS, candidate);
}

/** Les clés du registre, dans l'ordre des exemples (commande, compte, équipe). */
export function mailKeys(): readonly (keyof B2bMails)[] {
  return Object.keys(MAIL_SPECIMENS).filter(isMailKey);
}

/** Le moment d'un e-mail (C8). */
export function mailFamilyOf(mail: keyof B2bMails): MailFamily {
  return MAIL_SPECIMENS[mail].family;
}

/**
 * L'e-mail part-il dans la langue de son destinataire ? Vrai quand ses données
 * portent une langue ; sinon il part en français, quelle que soit la langue
 * d'un texte réécrit (`DEFAULT_MAIL_LOCALE`, `copy/mail-copy.ts`).
 */
export function mailFollowsLocale(mail: keyof B2bMails): boolean {
  const data: object = MAIL_SPECIMENS[mail].data("fr");
  return Object.hasOwn(data, "locale");
}

/** Les données d'exemple d'un e-mail, dans une langue. */
export function specimenDataOf<K extends keyof B2bMails>(
  mail: K,
  locale: ContentLocale,
): B2bMails[K] {
  const specimen: MailSpecimens[K] = MAIL_SPECIMENS[mail];
  return specimen.data(locale);
}

/**
 * Rend l'exemple d'un e-mail par son VRAI gabarit, avec ces textes à la place
 * de ceux du code, et cette mise en page — ordre des sections, repères de
 * l'aperçu (E4). Rien n'est écrit, rien n'est envoyé.
 */
export function renderMailSpecimen<K extends keyof B2bMails>(
  registry: TemplateRegistry<B2bMails>,
  mail: K,
  locale: ContentLocale,
  overlay: MailCopyOverlay,
  layout: MailLayoutScope = NO_MAIL_LAYOUT,
): RenderedMail {
  const render: TemplateRegistry<B2bMails>[K] = registry[mail];
  const data = specimenDataOf(mail, locale);
  return withMailCopyOverlay(overlay, () => withMailLayout(layout, () => render(data)));
}

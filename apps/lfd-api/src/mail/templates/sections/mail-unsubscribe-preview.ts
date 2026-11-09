import {
  type MailEditorUnsubscribeFooter,
  type MailLocale,
  type MailNature,
} from "@lfd/mail-blocks";
import type { LayoutUnsubscribe } from "@lfd/mailer";

import { unsubscribeFooterOf, withMailUnsubscribe } from "./mail-unsubscribe-scope.js";

/**
 * **L'adresse d'exemple du pied de désinscription dans l'éditeur** (plan
 * `plan-desinscription-des-e-mails.md`, U4). Jamais un vrai jeton : un jeton
 * se fabrique pour UNE adresse, et l'aperçu n'en a pas. Le domaine
 * `.invalid` est réservé (RFC 2606) : un clic dans l'aperçu ne mène nulle part.
 */
export const UNSUBSCRIBE_PREVIEW_URL = "https://exemple.invalid/mail/unsubscribe/exemple";

/**
 * Le pied que l'éditeur montre pour un modèle de cette nature, dans cette
 * langue ; `null` pour un e-mail transactionnel (ou un modèle inconnu), qui
 * n'en porte jamais.
 */
export function previewUnsubscribeFooter(
  nature: MailNature | null,
  locale: MailLocale,
): LayoutUnsubscribe | null {
  return nature === "marketing" ? unsubscribeFooterOf(locale, UNSUBSCRIBE_PREVIEW_URL) : null;
}

/**
 * Rend `run` comme l'envoi le rendrait : sous le pied de désinscription pour
 * un modèle marketing (le même périmètre que `MailerMailDispatch`), tel quel
 * sinon.
 */
export function withPreviewUnsubscribe<T>(
  nature: MailNature | null,
  locale: MailLocale,
  run: () => T,
): T {
  const footer = previewUnsubscribeFooter(nature, locale);
  return footer === null ? run() : withMailUnsubscribe(footer, run);
}

/**
 * Le pied que le canevas de l'éditeur montre, grisé, dans chaque langue
 * (`MailEditorView.unsubscribeFooter`) ; `null` pour un e-mail
 * transactionnel. Sans l'adresse du lien : le canevas n'en a pas l'usage.
 */
export function editorUnsubscribeFooters(
  nature: MailNature | null,
): Readonly<Record<MailLocale, MailEditorUnsubscribeFooter>> | null {
  if (nature !== "marketing") {
    return null;
  }
  const of = (locale: MailLocale): MailEditorUnsubscribeFooter => {
    const { before, label, after } = unsubscribeFooterOf(locale, UNSUBSCRIBE_PREVIEW_URL);
    return { before, label, after };
  };
  return { fr: of("fr"), en: of("en"), it: of("it") };
}

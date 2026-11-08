import { AsyncLocalStorage } from "node:async_hooks";

import type { ContentLocale } from "@lfd/contracts";
import type { LayoutUnsubscribe } from "@lfd/mailer";

import { MAIL_SYSTEM_COPY } from "../copy/mail-system-copy.js";

/** La variable de la phrase système, que le bloc remplit — jamais l'appelant. */
const UNSUBSCRIBE_VARIABLE = "{unsubscribeUrl}";

/**
 * **Le pied de désinscription d'un e-mail marketing**, dans sa langue (plan
 * `documentation/mail/plan-desinscription-des-e-mails.md`, B2) : la phrase
 * système, coupée autour de `{unsubscribeUrl}`. Lu tel quel — ni texte publié,
 * ni repère d'aperçu : la phrase est verrouillée.
 *
 * Exporté pour l'aperçu de l'éditeur (U4), qui le montrera grisé sous le
 * document avec une adresse d'exemple.
 */
export function unsubscribeFooterOf(locale: ContentLocale, url: string): LayoutUnsubscribe {
  const copy = MAIL_SYSTEM_COPY[locale].unsubscribe;
  const at = copy.sentence.indexOf(UNSUBSCRIBE_VARIABLE);
  return at < 0
    ? { before: `${copy.sentence} `, label: copy.link, url, after: "" }
    : {
        before: copy.sentence.slice(0, at),
        label: copy.link,
        url,
        after: copy.sentence.slice(at + UNSUBSCRIBE_VARIABLE.length),
      };
}

/**
 * **Le pied que le rendu en cours injecte** — ouvert par l'envoi du bloc
 * (`MailerMailDispatch`) pour un e-mail marketing seulement. Un périmètre et
 * non une donnée du modèle : un appelant ne peut ni le poser, ni l'ôter, et un
 * document publié avant le passage d'un modèle en marketing le reçoit quand
 * même.
 */
const unsubscribeScope = new AsyncLocalStorage<LayoutUnsubscribe>();

/** Rend `run` avec ce pied de désinscription. */
export function withMailUnsubscribe<T>(footer: LayoutUnsubscribe, run: () => T): T {
  return unsubscribeScope.run(footer, run);
}

/** Le pied du périmètre ouvert ; `undefined` pour tout e-mail transactionnel. */
export function activeMailUnsubscribe(): LayoutUnsubscribe | undefined {
  return unsubscribeScope.getStore();
}

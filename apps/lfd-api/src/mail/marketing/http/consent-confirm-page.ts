import type { MailLocale } from "@lfd/mail-blocks";

import { neutralPage } from "./unsubscribe-page.js";

/** Les textes de la page, sans nom d'espace ni charte (pas d'oracle). */
interface ConsentConfirmPageCopy {
  readonly title: string;
  readonly ask: string;
  readonly confirm: string;
  readonly done: string;
}

/**
 * **Les trois langues de la page de confirmation d'un accord** (plan de
 * désinscription, règle 18, C1). La même page pour tout jeton — valide,
 * expiré, rejoué, altéré : elle ne dit jamais si l'adresse est inscrite.
 */
const CONSENT_CONFIRM_PAGE_COPY: Readonly<Record<MailLocale, ConsentConfirmPageCopy>> = {
  fr: {
    title: "Confirmer l'inscription",
    ask: "Confirmez pour recevoir nos offres et nos nouvelles à l'adresse de cet e-mail.",
    confirm: "Confirmer mon inscription",
    done:
      "C'est noté : si ce lien était encore valable, l'inscription est confirmée. " +
      "Chaque e-mail portera un lien pour vous désinscrire.",
  },
  en: {
    title: "Confirm your sign-up",
    ask: "Confirm to receive our offers and news at the address this e-mail was sent to.",
    confirm: "Confirm my sign-up",
    done:
      "Done: if this link was still valid, your sign-up is confirmed. " +
      "Every e-mail will carry a link to unsubscribe.",
  },
  it: {
    title: "Confermare l'iscrizione",
    ask: "Confermi per ricevere le nostre offerte e novità all'indirizzo di questa e-mail.",
    confirm: "Confermare l'iscrizione",
    done:
      "Fatto: se questo link era ancora valido, l'iscrizione è confermata. " +
      "Ogni e-mail porterà un link per annullarla.",
  },
};

/**
 * La page du `GET` : une question et un bouton qui POSTE vers la même
 * adresse. Elle ne lit pas le jeton — un antivirus qui ouvre le lien ne
 * confirme rien.
 */
export function consentConfirmPage(locale: MailLocale): string {
  const copy = CONSENT_CONFIRM_PAGE_COPY[locale];
  return neutralPage(
    locale,
    copy.title,
    `<p>${copy.ask}</p><form method="post"><button type="submit">${copy.confirm}</button></form>`,
  );
}

/** La page du `POST` : la même réponse, quel que soit le jeton. */
export function consentConfirmedPage(locale: MailLocale): string {
  const copy = CONSENT_CONFIRM_PAGE_COPY[locale];
  return neutralPage(locale, copy.title, `<p>${copy.done}</p>`);
}

import type { MailLocale } from "@lfd/mail-blocks";

/** Les textes de la page, sans nom d'espace ni charte (pas d'oracle). */
export interface UnsubscribePageCopy {
  readonly title: string;
  readonly ask: string;
  readonly keepsTransactional: string;
  readonly wholeGroup: string;
  readonly confirm: string;
  readonly done: string;
}

/**
 * **Les trois langues de la page de désinscription** (plan de
 * désinscription, règle 5). La même page pour tout jeton : elle ne dit
 * jamais si l'adresse était inscrite, ni à quelle société.
 */
export const UNSUBSCRIBE_PAGE_COPY: Readonly<Record<MailLocale, UnsubscribePageCopy>> = {
  fr: {
    title: "Se désinscrire",
    ask: "Confirmez pour ne plus recevoir nos offres et nos nouvelles à l'adresse de cet e-mail.",
    keepsTransactional:
      "Les e-mails liés à vos commandes et à votre compte continueront d'arriver.",
    wholeGroup: "Ne plus rien recevoir du groupe La Folie Douce",
    confirm: "Confirmer la désinscription",
    done: "C'est noté : si cette adresse recevait nos offres, elle n'en recevra plus.",
  },
  en: {
    title: "Unsubscribe",
    ask: "Confirm to stop receiving our offers and news at the address this e-mail was sent to.",
    keepsTransactional: "E-mails about your orders and your account will keep arriving.",
    wholeGroup: "Stop receiving anything from the La Folie Douce group",
    confirm: "Confirm unsubscription",
    done: "Done: if this address was receiving our offers, it will not receive them any more.",
  },
  it: {
    title: "Annulla l'iscrizione",
    ask: "Conferma per non ricevere più le nostre offerte e novità all'indirizzo di questa e-mail.",
    keepsTransactional: "Le e-mail sui tuoi ordini e sul tuo account continueranno ad arrivare.",
    wholeGroup: "Non ricevere più nulla dal gruppo La Folie Douce",
    confirm: "Conferma l'annullamento",
    done: "Fatto: se questo indirizzo riceveva le nostre offerte, non le riceverà più.",
  },
};

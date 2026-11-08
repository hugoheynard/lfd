import type { ContentLocale } from "@lfd/contracts";

/**
 * **Les phrases système des e-mails** — celles que le BLOC pose lui-même,
 * hors de tout modèle (plan `documentation/mail/plan-desinscription-des-e-mails.md`,
 * contradiction B2).
 *
 * Elles ne sont pas une section du dictionnaire par modèle (`MailCopy`, une
 * section par clé du registre, et aucune autre) : le pied de désinscription
 * suit TOUT e-mail marketing, quel que soit son modèle. Elles sont donc
 * verrouillées par construction — aucun écran ne les écrit, aucun texte publié
 * ne les remplace — et inscrites au manifeste sous `system`
 * (`pnpm tool mail-copy:digest`, porte `lint:mail-copy-digest`).
 */
export interface MailSystemCopy {
  readonly unsubscribe: {
    /**
     * La phrase du pied d'un e-mail marketing. `{unsubscribeUrl}` : le lien,
     * posé par le bloc — le HTML y met `link`, le texte l'adresse en clair.
     */
    readonly sentence: string;
    /** Le libellé du lien, dans le HTML. */
    readonly link: string;
  };
}

/** Les trois langues : une phrase ajoutée ne compile pas tant qu'elle n'est pas traduite. */
export const MAIL_SYSTEM_COPY: Readonly<Record<ContentLocale, MailSystemCopy>> = {
  fr: {
    unsubscribe: {
      sentence:
        "Vous recevez cet e-mail parce que vous avez accepté nos offres et nos nouvelles. " +
        "Pour ne plus les recevoir : {unsubscribeUrl}",
      link: "se désinscrire",
    },
  },
  en: {
    unsubscribe: {
      sentence:
        "You are receiving this e-mail because you agreed to our offers and news. " +
        "To stop receiving them: {unsubscribeUrl}",
      link: "unsubscribe",
    },
  },
  it: {
    unsubscribe: {
      sentence:
        "Ricevi questa e-mail perché hai accettato le nostre offerte e novità. " +
        "Per non riceverle più: {unsubscribeUrl}",
      link: "annulla l'iscrizione",
    },
  },
};

/** Les variables permises de chaque phrase système, par chemin — comme `MAIL_COPY_VARIABLES`. */
export const MAIL_SYSTEM_VARIABLES: Readonly<Record<string, readonly string[]>> = {
  "unsubscribe.sentence": ["unsubscribeUrl"],
};

import type { ContentLocale } from "@lfd/contracts";

import { MAIL_EN } from "./mail-copy.en.js";
import { MAIL_FR } from "./mail-copy.fr.js";
import { MAIL_IT } from "./mail-copy.it.js";
import type { MailCopy, MailCopyBook } from "./mail-copy.model.js";

/**
 * Le dictionnaire des e-mails, dans les trois langues.
 *
 * Le type fait le travail : `MailCopyBook` étant un `Record` sur
 * `ContentLocale`, une langue absente ne compile pas — et une phrase ajoutée au
 * modèle rend les trois fichiers incomplets d'un coup.
 */
export const MAIL_COPY: MailCopyBook = { fr: MAIL_FR, en: MAIL_EN, it: MAIL_IT };

/**
 * La langue de repli.
 *
 * ⚠️ **Rien ne choisit encore la langue d'un client** : `User` ne porte pas de
 * préférence, et l'inventer depuis l'en-tête `Accept-Language` d'une requête
 * HTTP donnerait la langue du NAVIGATEUR de celui qui commande, pas celle dans
 * laquelle la personne veut être écrite. Tant que la préférence n'existe pas,
 * l'appelant passe `fr` — et le jour où elle existera, il n'y aura qu'un
 * paramètre à remplir, pas un gabarit à traduire.
 */
export const DEFAULT_MAIL_LOCALE: ContentLocale = "fr";

/** Les textes d'une langue. Jamais d'accès direct au `Record` chez l'appelant. */
export function mailCopyOf(locale: ContentLocale): MailCopy {
  return MAIL_COPY[locale];
}

/**
 * Remplace `{clé}` par sa valeur. Volontairement minimal : un gabarit d'e-mail
 * n'a pas besoin d'un moteur, et une interpolation qui accepte des expressions
 * finirait par en accepter une venue d'une saisie utilisateur.
 */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
}

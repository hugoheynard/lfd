import type { ContentLocale } from "@lfd/contracts";

import { MAIL_EN } from "./mail-copy.en.js";
import { MAIL_FR } from "./mail-copy.fr.js";
import { MAIL_IT } from "./mail-copy.it.js";
import type { MailCopy, MailCopyBook } from "./mail-copy.model.js";
import { activeMailCopyOverlay, overlaidMailCopy } from "./mail-copy-overlay.js";
import { activeMailLayout } from "../sections/mail-layout-scope.js";
import { markedCopy } from "../sections/mail-text-markers.js";

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

/**
 * Les textes EFFECTIFS d'une langue — ceux du code, remplacés par les textes
 * publiés (ou, pour un aperçu, par les brouillons) quand un périmètre de
 * remplacement est ouvert (`withMailCopyOverlay`, plan
 * `plan-textes-des-e-mails.md`, C2). Jamais d'accès direct au `Record` chez
 * l'appelant. Dans un aperçu repéré (E4, S4), chaque texte porte son repère.
 */
export function mailCopyOf(locale: ContentLocale): MailCopy {
  const overlay = activeMailCopyOverlay();
  const copy =
    overlay === undefined
      ? MAIL_COPY[locale]
      : overlaidMailCopy(MAIL_COPY[locale], overlay, locale);
  return activeMailLayout()?.markers === true ? markedOnce(copy) : copy;
}

const marked = new WeakMap<MailCopy, MailCopy>();

/**
 * Le dictionnaire aux textes repérés — dans un périmètre d'APERÇU seulement
 * (plan `plan-textes-des-e-mails.md`, E4, S4 ; `sections/mail-text-markers.ts`).
 */
function markedOnce(copy: MailCopy): MailCopy {
  const known = marked.get(copy);
  if (known !== undefined) {
    return known;
  }
  const fresh = markedCopy(copy);
  marked.set(copy, fresh);
  return fresh;
}

/**
 * Remplace `{clé}` par sa valeur. Volontairement minimal : un gabarit d'e-mail
 * n'a pas besoin d'un moteur, et une interpolation qui accepte des expressions
 * finirait par en accepter une venue d'une saisie utilisateur.
 */
export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (whole, key: string) => values[key] ?? whole);
}

/**
 * La forme avec prénom (`{firstName}`), ou celle sans quand on ne le connaît
 * pas. Deux textes plutôt qu'une virgule ôtée par le code : la ponctuation
 * d'une salutation n'est pas la même dans toutes les langues.
 */
export function fillNamed(named: string, anonymous: string, firstName: string): string {
  return firstName === "" ? anonymous : fill(named, { firstName });
}

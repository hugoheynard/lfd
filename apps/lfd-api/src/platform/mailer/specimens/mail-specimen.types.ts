import type { ContentLocale } from "@lfd/contracts";

import type { B2bMails } from "../mail-templates.js";

/**
 * Le moment d'un e-mail — la famille de son dictionnaire (`copy/model/`), par
 * laquelle l'écran des textes les range (plan `plan-textes-des-e-mails.md`, C8).
 */
export type MailFamily = "order" | "payment" | "billing" | "account" | "team";

/**
 * **Un e-mail d'exemple** : son moment, et les données d'exemple que son VRAI
 * gabarit rend (C6). `data` reçoit la langue de l'aperçu ; un e-mail dont les
 * données ne portent pas de langue l'ignore — il part en français.
 */
export interface MailSpecimen<K extends keyof B2bMails> {
  readonly family: MailFamily;
  readonly data: (locale: ContentLocale) => B2bMails[K];
}

/** Un exemple par e-mail du registre — exhaustif par construction. */
export type MailSpecimens = { readonly [K in keyof B2bMails]: MailSpecimen<K> };

/**
 * Tout ce qui désigne quelqu'un dit « EXEMPLE », comme sur la planche des
 * documents (`documentation/comptabilite/planche-des-documents.md`) : un essai
 * transféré ne passe jamais pour un vrai courriel.
 */
export const SPECIMEN_MARK = "EXEMPLE";

/** Les liens d'un exemple mènent à un domaine réservé, qui ne répond jamais. */
export const SPECIMEN_URL = "https://exemple.invalid";

/**
 * Un PDF d'une page vide, valide : les pièces jointes d'un essai s'ouvrent,
 * et ne disent rien qui puisse passer pour un document réel.
 */
const SPECIMEN_PDF_TEXT = [
  "%PDF-1.4",
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj",
  "trailer<</Root 1 0 R>>",
  "%%EOF",
].join("\n");

export const SPECIMEN_PDF_BASE64 = Buffer.from(SPECIMEN_PDF_TEXT, "latin1").toString("base64");

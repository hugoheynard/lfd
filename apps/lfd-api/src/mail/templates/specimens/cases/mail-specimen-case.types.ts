import type { ContentLocale } from "@lfd/contracts";

import type { B2bMails } from "../../mail-templates.js";

/**
 * **Un cas d'un e-mail** (plan `plan-editeur-par-blocs.md`, § 16, lot S4d) :
 * un jeu de données d'exemple, servi en production à l'éditeur et à son
 * aperçu fidèle. Des données INVENTÉES et lisibles comme telles (marque
 * `EXEMPLE`, domaine `exemple.invalid`) — jamais tirées d'un client.
 */
export interface MailSpecimenCase<K extends keyof B2bMails> {
  /** Stable : l'écran le garde et le renvoie à l'aperçu. */
  readonly id: string;
  /** Ce que l'équipe lit dans la liste des cas, en français. */
  readonly label: string;
  readonly data: (locale: ContentLocale) => B2bMails[K];
}

/**
 * **Un axe d'un e-mail** : une donnée qui fait changer ses phrases (le régime
 * de règlement, l'auteur d'une annulation, un prénom présent ou non). La
 * valeur est LUE sur les données d'un cas, jamais déclarée à côté : un cas
 * qui prétendrait exercer un axe sans en porter la donnée ne compterait pas.
 */
export interface MailCaseAxis<K extends keyof B2bMails> {
  readonly id: string;
  /** Toutes les valeurs que le gabarit distingue : chacune a un cas. */
  readonly values: readonly string[];
  readonly of: (data: B2bMails[K]) => string;
}

/** Les cas d'un e-mail et ses axes. Le premier cas est l'exemple de l'e-mail. */
export interface MailCaseTable<K extends keyof B2bMails> {
  readonly cases: readonly [MailSpecimenCase<K>, ...MailSpecimenCase<K>[]];
  readonly axes: readonly MailCaseAxis<K>[];
}

/** Une table par e-mail du registre — exhaustive par construction. */
export type MailCaseTables = { readonly [K in keyof B2bMails]: MailCaseTable<K> };

/** L'identifiant du premier cas de chaque e-mail : son exemple (S4c le servait seul). */
export const SPECIMEN_CASE_ID = "specimen";

import { SEPA_MAX140_TEXT } from "./sepa-text.js";

/**
 * **Les valeurs du fichier des comptes destinataires** de la banque
 * (`modele-comptes-destinataires-2026.csv`) — celles que la banque n'a PAS
 * dites, et que nous avons choisies pour bâtir avant sa réponse (Hugo,
 * 2026-10-23 : « on documente nos choix faits en l'absence d'info »).
 *
 * Chaque constante renvoie à sa ligne du tableau « Choix faits en l'absence de
 * réponse de la banque » de
 * `documentation/comptabilite/prelevement/prerequis-export-ribs.md` (§ 7), qui
 * dit la question posée (Q-B…) et ce que coûte l'erreur. Ce module est le SEUL
 * endroit qui les écrit : une réponse de la banque se corrige en une ligne.
 *
 * Il ne réutilise pas les valeurs du fichier des mandats exprès : les deux
 * modèles divergent déjà (terminateur `;`, colonnes), et une réponse sur l'un
 * ne doit pas bouger l'autre.
 */

/**
 * A — « Type format » : `I` pour IBAN. MONTRÉ par la consigne du modèle
 * (« colonne A : I pour IBAN »), pas supposé ; ici parce que c'est une valeur
 * de cellule (§ 1, 2026-10-23).
 */
export const ACCOUNT_FORMAT_TYPE_CELL = "I";

/**
 * Lignes par fichier : 200 au plus. DIT (réponse 8 de la banque, 2026-10-23) ;
 * la préparation prend les 200 premiers, les suivants restent « à exporter »
 * (§ 2.2).
 */
export const ACCOUNT_IMPORT_MAX_ROWS = 200;

/**
 * B — le nom : 140 caractères au plus, après translittération. CHOIX du
 * 2026-10-23 (§ 7, Q-B4d) : la réponse 11 a donné 140 pour le « bénéficiaire »
 * à propos du fichier des mandats. Au-delà, l'export est REFUSÉ et le compte
 * nommé, jamais coupé — même règle que le nom du débiteur des mandats.
 */
export const ACCOUNT_HOLDER_MAX_LENGTH = SEPA_MAX140_TEXT;

/**
 * La ligne d'en-tête : AUCUNE. CHOIX du 2026-10-23 (§ 7, Q-B4b) — la consigne
 * du fichier des mandats dit de l'enlever, et une en-tête prise pour un compte
 * ferait rejeter tout l'import. Si la banque la veut : y mettre la ligne
 * d'en-tête du modèle, sans fin de ligne.
 */
export const ACCOUNT_FILE_HEADER: string | null = null;

/**
 * G — « Adresse 4 » : vide. CHOIX du 2026-10-23 (§ 7, Q-B1) — D, E et F
 * portent la rue, son complément, puis « code postal ville » ; le pays va en H.
 */
export const ADDRESS_LINE_4_CELL = "";

/**
 * M — « Nom liste » : vide. CHOIX du 2026-10-23 (§ 7, Q-B4e) — sens inconnu.
 */
export const LIST_NAME_CELL = "";

/**
 * N — « Type identifiant banque bénéficiaire » : vide. CHOIX du 2026-10-23
 * (§ 7, Q-B4g) — supposé réservé aux comptes hors SEPA, et nous n'en avons pas.
 */
export const BANK_IDENTIFIER_TYPE_CELL = "";

/**
 * O — « ABA/BSB/INS » : vide. CHOIX du 2026-10-23 (§ 7, Q-B4g) — codes
 * bancaires américains et australiens, hors SEPA.
 */
export const ABA_BSB_INS_CELL = "";

/**
 * P — « NIF » : vide. CHOIX du 2026-10-23 (§ 7, Q-B4f) — sens inconnu
 * (numéro d'identification fiscale ?).
 */
export const TAX_IDENTIFIER_CELL = "";

/** Les trois morceaux d'un IBAN que le modèle range en I, J et K. */
export interface IbanCells {
  /** I — « Code Pays Iban ». */
  readonly country: string;
  /** J — « Clé Iban ». */
  readonly key: string;
  /** K — « BBAN/RIB ». */
  readonly account: string;
}

/**
 * I, J et K. Le découpage pays / clé est déduit des intitulés ; K = le BBAN
 * SEUL (caractères 5 à la fin) est un CHOIX du 2026-10-23 (§ 7, Q-B4c) : I et
 * J portent déjà pays et clé. Si la banque veut l'IBAN entier en K : rendre
 * `normalizedIban` ici.
 *
 * @param normalizedIban l'IBAN sans espace, en majuscules (`Iban.value`).
 */
export function ibanCells(normalizedIban: string): IbanCells {
  return {
    country: normalizedIban.slice(0, 2),
    key: normalizedIban.slice(2, 4),
    account: normalizedIban.slice(4),
  };
}

/**
 * F — « Adresse 3 » : « code postal ville ». CHOIX du 2026-10-23 (§ 7, Q-B1)
 * — la consigne « Colonne D, E, F, G : » est coupée dans le modèle.
 */
export function cityLineCell(postalCode: string, city: string): string {
  return `${postalCode} ${city}`.trim();
}

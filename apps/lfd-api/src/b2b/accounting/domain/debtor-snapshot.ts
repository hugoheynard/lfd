/**
 * **Le débiteur, figé** — ce qu'un mandat imprime de la société et de son compte.
 *
 * ## Pourquoi une copie, et pas le RIB du client
 *
 * Même raison que {@link CreditorSnapshot} : un document émis ne doit pas
 * changer quand la fiche change. Ici, la copie sert d'abord à autre chose — le
 * RIB du client vit dans `payments`, et ce contexte-ci n'a pas à connaître son
 * agrégat pour dessiner un formulaire. Il déclare la forme dont il a besoin ;
 * `payments` la fournit.
 *
 * ## 🔴 L'IBAN est ici EN CLAIR, et c'est le seul endroit qui l'exige
 *
 * Il faut bien l'imprimer : les deux formulaires ont un peigne fait pour ça,
 * et c'est le compte que le débiteur reconnaît sur son relevé. La copie est donc
 * de courte vie — le temps d'un rendu — et ne se range nulle part.
 *
 * ⚠️ Ne jamais l'ajouter à une vue d'écran ni à une réponse d'API. Le chemin qui
 * le fait sortir est un PDF, et un seul.
 */
export interface DebtorSnapshot {
  /**
   * La **société** débitrice — sa raison sociale, imprimée par le mandat
   * interentreprises. Distincte de {@link holder} : le titulaire du compte peut
   * être une autre personne que le débiteur (le gabarit le dit en toutes lettres).
   */
  readonly companyName: string;
  /**
   * Le SIREN du débiteur, **dérivé** du SIRET par {@link sirenOfSiret} ; vide
   * quand la société n'a pas de SIRET exploitable (le peigne reste à remplir à
   * la main, décision Q3 du plan `plan-mandat-deux-schemas.md`).
   */
  readonly siren: string;
  /** Le titulaire tel que sa banque le connaît. */
  readonly holder: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  readonly iban: string;
  readonly bic: string;

  /**
   * **Zone 14** — le code que le débiteur veut voir revenir sur son relevé.
   *
   * Facultatif par la norme, et utile en pratique : c'est ce qui permet à un
   * client de rapprocher une ligne de son relevé bancaire d'un dossier chez
   * nous. Sa référence société (`C-XXXXXX`) est le candidat naturel.
   */
  readonly debtorReference: string;

  /** **Zone 19** — le numéro du contrat que ce mandat sert à régler. */
  readonly contractNumber: string;
}

/**
 * ⚠️ La **zone 20** a vécu ici jusqu'au 2026-09-12. Elle est remontée sur
 * `CreditorSnapshot` : elle décrit ce que NOUS vendons, et la même phrase part
 * sur tous les mandats d'une entité. La chercher ici est le réflexe naturel —
 * d'où cette note.
 */

/** La longueur d'un SIRET : le SIREN (9) suivi du NIC (5). */
const SIRET_LENGTH = 14;
const SIREN_LENGTH = 9;

/**
 * Le SIREN tiré d'un SIRET — ses **neuf premiers chiffres**.
 *
 * Vide dès que le SIRET n'a pas la forme d'un SIRET (quatorze chiffres, blancs
 * ignorés) : il est **facultatif** à l'ouverture d'une société (chaîne vide =
 * absence), et un SIRET ancien n'a pas forcément été revalidé. Neuf caractères
 * pris sur une valeur abîmée imprimeraient un SIREN faux sur un papier signé ;
 * un peigne vide, lui, se remplit à la main.
 */
export function sirenOfSiret(siret: string): string {
  const digits = siret.replace(/\s/gu, "");
  return digits.length === SIRET_LENGTH && /^\d+$/u.test(digits)
    ? digits.slice(0, SIREN_LENGTH)
    : "";
}

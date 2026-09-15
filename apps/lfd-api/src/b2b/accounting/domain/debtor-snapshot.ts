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
   * Le SIREN **stocké** de la société ; vide quand il n'est pas connu. La frappe
   * interentreprises le refuse vide, mais l'exemplaire et un brouillon CORE
   * peuvent s'imprimer sans — le peigne reste alors à remplir à la main.
   *
   * ⚠️ Il était dérivé du SIRET jusqu'au 2026-09-15 (`sirenOfSiret`, supprimé) :
   * plan `plan-mentions-obligatoires-du-mandat.md` §9.
   */
  readonly siren: string;
  /** Le titulaire tel que sa banque le connaît. */
  readonly holder: string;
  /**
   * Civilité ou forme juridique du **titulaire**, recopiée du RIB — imprimée
   * par le seul mandat interentreprises ; vide quand non renseignée.
   */
  readonly holderLegalForm: string;
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

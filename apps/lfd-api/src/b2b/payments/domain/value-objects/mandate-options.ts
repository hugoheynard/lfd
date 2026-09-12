/** Ce qu'on recopie, avant normalisation. */
export interface MandateOptionsInput {
  readonly debtorReference: string;
  readonly contractNumber: string;
  readonly contractDescription: string;
}

/**
 * **Les zones facultatives du mandat qui nous appartiennent** — 14, 19 et 20 du
 * modèle EPC.
 *
 * ## Ce qu'elles sont, et ce qu'elles ne sont pas
 *
 * - **14** — le code que le débiteur veut voir revenir sur son relevé bancaire.
 *   C'est ce qui lui permet de rapprocher une ligne d'un dossier chez nous ;
 * - **19** — le numéro du contrat que ce mandat sert à régler ;
 * - **20** — ce que ce contrat couvre, en une ligne.
 *
 * 🔴 **Aucune ne conditionne la validité du mandat.** La norme les range sous
 * « fournies seulement à titre indicatif ». Un objet vide est donc un état
 * parfaitement normal, et il n'y a rien à refuser ici — ce qui est la raison
 * pour laquelle cette classe ne lève jamais.
 *
 * Les zones 15 à 18 n'y sont pas : les deux premières désignent un **tiers
 * débiteur**, que seul le signataire connaît ; les deux autres un **tiers
 * créancier**, qui n'existe pas tant que nous n'encaissons pour personne.
 * Offrir une saisie pour ce qu'on ne peut pas savoir ferait inventer.
 */
export class MandateOptions {
  private constructor(
    readonly debtorReference: string,
    readonly contractNumber: string,
    readonly contractDescription: string,
  ) {}

  /** Aucune zone facultative renseignée — le cas ordinaire. */
  static empty(): MandateOptions {
    return new MandateOptions("", "", "");
  }

  /**
   * Normalise sans rien refuser.
   *
   * Le rognage n'est pas cosmétique : une espace de fin devant un pointillé
   * décale le texte imprimé, et deux valeurs qui ne diffèrent que par elle
   * feraient croire à un changement là où il n'y en a pas.
   */
  static create(input: MandateOptionsInput): MandateOptions {
    return new MandateOptions(
      input.debtorReference.trim(),
      input.contractNumber.trim(),
      input.contractDescription.trim(),
    );
  }

  /** Y a-t-il quoi que ce soit à imprimer dans la dernière section ? */
  get isEmpty(): boolean {
    return (
      this.debtorReference === "" && this.contractNumber === "" && this.contractDescription === ""
    );
  }
}

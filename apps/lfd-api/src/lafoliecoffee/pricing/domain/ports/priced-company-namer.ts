/**
 * **Comment s'appelle la société** qu'une décision tarifaire vise — pour figer
 * son nom dans la phrase et la charge d'un fait (lot B du plan des phrases du
 * journal, D5, 2026-09-19).
 *
 * Un port à part de {@link PricedCompanyReader} (ISP) : l'un dit si la société
 * existe, pour refuser un tarif qui ne filtrerait rien ; l'autre la nomme pour
 * le journal, et aucun consommateur n'a besoin des deux. La tarification ne lit
 * pas `account/` : la frontière passe par ce port, que son adaptateur tient.
 *
 * Rien ici n'entre dans un calcul de prix : ce nom ne sert qu'à la phrase.
 */
export abstract class PricedCompanyNamer {
  /**
   * Le nom sous lequel les écrans montrent la société — l'enseigne, à défaut
   * la raison sociale —, ou `null` : aucune société sous cet identifiant.
   */
  abstract nameOf(companyId: string): Promise<string | null>;
}

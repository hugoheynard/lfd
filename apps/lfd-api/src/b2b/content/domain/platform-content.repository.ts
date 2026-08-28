import type { FooterContent, FooterContentView } from "@lfd/contracts";

/**
 * Port du **contenu de plateforme** — les textes de la vitrine, tenus par le
 * staff.
 *
 * Une ligne par bloc, sa clé connue à l'avance. Il n'y a ni création ni
 * suppression : un bloc existe parce que la vitrine l'affiche, pas parce que
 * quelqu'un l'a ajouté. D'où `read` / `save`, et rien d'autre.
 */
export abstract class PlatformContentRepository {
  /**
   * Le pied de page.
   *
   * ⚠️ Ne renvoie JAMAIS `null` : tant que personne n'a rien enregistré, il
   * rend le contenu de DÉPART du contrat, avec `revision: 0`. C'est ce qui
   * garantit qu'aucun appelant n'a de cas « pas de contenu » à traiter — et
   * donc qu'il n'existe aucune fenêtre où la vitrine s'afficherait vide.
   */
  abstract readFooter(): Promise<FooterContentView>;

  /**
   * Enregistre le pied de page et rend l'état résultant.
   *
   * La révision monte d'un cran à chaque écriture, y compris si le texte est
   * identique : elle date un GESTE, pas un contenu.
   */
  abstract saveFooter(content: FooterContent, staffUserId: string): Promise<FooterContentView>;
}

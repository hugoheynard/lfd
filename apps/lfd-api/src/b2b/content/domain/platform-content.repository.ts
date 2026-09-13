import type { FooterContent, FooterContentView, SalesTermsView } from "@lfd/contracts";

import type { SalesTermsDocument } from "./entities/sales-terms-document.js";

/**
 * Port du **contenu de plateforme** — les textes de la vitrine, tenus par le
 * staff.
 *
 * Une ligne par bloc, sa clé connue à l'avance. Il n'y a ni création ni
 * suppression : un bloc existe parce que la vitrine l'affiche, pas parce que
 * quelqu'un l'a ajouté. D'où `read` / `save`, et rien d'autre.
 *
 * ⚠️ **Deux blocs, deux formes d'accès, et la différence est le sujet.** Le pied
 * de page n'a aucun refus : il se lit et s'enregistre entier. Les CGV, elles,
 * portent des transitions — d'où un `load` qui rend l'AGRÉGAT et un `save` qui
 * le reprend, jamais une écriture de champ à partir de primitives.
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

  /**
   * Les conditions générales de vente, pour la LECTURE.
   *
   * ⚠️ Ne renvoie pas plus `null` que {@link readFooter}, et pour la même
   * raison : tant que personne n'a rien enregistré, il rend le document de
   * DÉPART du contrat avec `revision: 0`. La boutique n'a donc aucun instant où
   * son dialogue de CGV serait vide.
   */
  abstract readSalesTerms(): Promise<SalesTermsView>;

  /**
   * Les conditions générales de vente, pour l'ÉCRITURE — l'agrégat, pas la vue.
   *
   * Un document jamais enregistré se charge sur le contenu de départ : c'est ce
   * qui permet de corriger un article de démonstration sans avoir eu à
   * « créer » quoi que ce soit d'abord.
   */
  abstract loadSalesTerms(): Promise<SalesTermsDocument>;

  /**
   * Enregistre le document et fait monter la révision d'un cran.
   *
   * Rend `void` : une commande ne rend pas de modèle de lecture (§4), et le
   * front relit.
   */
  abstract saveSalesTerms(document: SalesTermsDocument, staffUserId: string): Promise<void>;
}

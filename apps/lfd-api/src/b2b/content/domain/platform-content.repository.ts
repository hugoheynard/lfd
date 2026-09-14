import type {
  FooterContent,
  FooterContentView,
  LegalDocumentView,
  LegalMention,
} from "@lfd/contracts";

import type { LegalDocument } from "./entities/legal-document.js";

/**
 * Port du **contenu de plateforme** — les textes de la vitrine, tenus par le
 * staff.
 *
 * Une ligne par bloc, sa clé connue à l'avance. Il n'y a ni création ni
 * suppression : un bloc existe parce que la vitrine l'affiche, pas parce que
 * quelqu'un l'a ajouté. D'où `read` / `save`, et rien d'autre.
 *
 * ⚠️ **Deux formes de bloc, deux formes d'accès, et la différence est le
 * sujet.** Le pied de page n'a aucun refus : il se lit et s'enregistre entier.
 * Un document de mention légale, lui, porte des transitions — d'où un `load`
 * qui rend l'AGRÉGAT et un `save` qui le reprend, jamais une écriture de champ
 * à partir de primitives.
 *
 * 🔴 Les trois méthodes des documents prennent la **mention** : c'est elle qui
 * désigne la ligne. Elle vient du vocabulaire fermé du contrat, validée au bord
 * — le port ne reçoit jamais une clé libre.
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
   * Le document d'une mention, pour la LECTURE.
   *
   * ⚠️ Ne renvoie pas plus `null` que {@link readFooter}, et pour la même
   * raison : tant que personne n'a rien enregistré, il rend le document de
   * DÉPART du contrat avec `revision: 0`. La boutique n'a donc aucun instant où
   * son dialogue serait vide — il annonce alors une mention non publiée.
   */
  abstract readLegalDocument(mention: LegalMention): Promise<LegalDocumentView>;

  /**
   * Le document d'une mention, pour l'ÉCRITURE — l'agrégat, pas la vue.
   *
   * Un document jamais enregistré se charge sur le contenu de départ : c'est ce
   * qui permet d'écrire son premier article sans avoir eu à « créer » quoi que
   * ce soit d'abord.
   */
  abstract loadLegalDocument(mention: LegalMention): Promise<LegalDocument>;

  /**
   * Enregistre le document de la mention et fait monter sa révision d'un cran.
   *
   * Rend `void` : une commande ne rend pas de modèle de lecture (§4), et le
   * front relit.
   */
  abstract saveLegalDocument(
    mention: LegalMention,
    document: LegalDocument,
    staffUserId: string,
  ): Promise<void>;
}

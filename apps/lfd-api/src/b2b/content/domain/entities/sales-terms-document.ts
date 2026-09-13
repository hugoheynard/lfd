import {
  MAX_SALES_TERMS_PARAGRAPHS,
  type SalesTerms,
  type SalesTermsHeading,
  type SalesTermsParagraph,
  type SalesTermsParagraphPayload,
} from "@lfd/contracts";

import {
  DuplicateSalesTermsParagraphError,
  SalesTermsDocumentFullError,
  SalesTermsPositionOutOfRangeError,
  UnknownSalesTermsParagraphError,
} from "../errors/sales-terms-errors.js";

/**
 * **Les conditions générales de vente**, en tant qu'agrégat.
 *
 * Le pied de page voisin n'en a pas, et c'est juste : rien ne peut y refuser une
 * écriture, sa validité est une affaire de FORME que le schéma du contrat tient
 * au bord. Les CGV, elles, portent des refus qu'aucun schéma ne peut exprimer —
 * un article inconnu, un rang hors du document, une borne atteinte — parce que
 * tous trois dépendent de l'ÉTAT courant du document.
 *
 * Le cycle est celui du dépôt : `load → méthode métier → save`. Le port ne gagne
 * aucune écriture de champ à partir de primitives, sans quoi ces trois refus
 * repartiraient dans les handlers, où le prochain appelant ne les verrait pas.
 *
 * ⚠️ L'identifiant d'un article vient du port `IdGenerator` et arrive ici tout
 * frappé : l'agrégat ne fabrique rien, il n'a pas le droit de connaître le
 * temps ni l'aléa.
 */
export class SalesTermsDocument {
  private constructor(
    private heading: SalesTermsHeading,
    private readonly paragraphs: SalesTermsParagraph[],
  ) {}

  /**
   * Rehydrate le document depuis le contenu stocké.
   *
   * Le contenu arrive **déjà relu par le schéma** (c'est l'adaptateur qui le
   * fait, parce que le domaine ne connaît pas Zod) : reconstituer, ici, c'est
   * reprendre la main sur les transitions, pas revalider la forme une seconde
   * fois avec une règle qui divergerait de la première.
   */
  static reconstitute(content: SalesTerms): SalesTermsDocument {
    return new SalesTermsDocument(content.title, [...content.paragraphs]);
  }

  /** Renomme le document. Le titre sert aussi de libellé au lien de la boutique. */
  retitle(heading: SalesTermsHeading): void {
    this.heading = heading;
  }

  /**
   * Ajoute un article **en fin de document** — l'ordre porte du sens, et une
   * insertion au milieu se dit en deux gestes : ajouter, puis déplacer.
   *
   * @throws {SalesTermsDocumentFullError} le document a atteint sa borne.
   * @throws {DuplicateSalesTermsParagraphError} l'identifiant est déjà pris.
   */
  addParagraph(id: string, prose: SalesTermsParagraphPayload): void {
    if (this.paragraphs.length >= MAX_SALES_TERMS_PARAGRAPHS) {
      throw new SalesTermsDocumentFullError(MAX_SALES_TERMS_PARAGRAPHS);
    }
    if (this.paragraphs.some((paragraph) => paragraph.id === id)) {
      throw new DuplicateSalesTermsParagraphError(id);
    }
    this.paragraphs.push({ id, ...prose });
  }

  /**
   * Réécrit les trois langues d'un article. L'identifiant survit à la
   * réécriture : c'est lui que les routes désignent.
   *
   * @throws {UnknownSalesTermsParagraphError} l'article n'existe pas.
   */
  editParagraph(id: string, prose: SalesTermsParagraphPayload): void {
    const index = this.indexOf(id);
    this.paragraphs[index] = { id, ...prose };
  }

  /**
   * Retire un article.
   *
   * Pas d'archivage ici, à la différence d'un agrégat métier : un article
   * supprimé n'a pas d'historique à porter, et la `revision` de la ligne dit
   * déjà qu'un geste a eu lieu.
   *
   * @throws {UnknownSalesTermsParagraphError} l'article n'existe pas.
   */
  removeParagraph(id: string): void {
    this.paragraphs.splice(this.indexOf(id), 1);
  }

  /**
   * Déplace un article au rang demandé, à partir de zéro.
   *
   * Le rang se lit dans le document **après** retrait de l'article déplacé :
   * c'est la lecture qu'a le rédacteur, qui vise une place dans la liste finale
   * et non un décalage. Le dernier rang valide est donc `count - 1`.
   *
   * @throws {UnknownSalesTermsParagraphError} l'article n'existe pas.
   * @throws {SalesTermsPositionOutOfRangeError} le rang est hors du document.
   */
  moveParagraph(id: string, position: number): void {
    const index = this.indexOf(id);
    if (!Number.isInteger(position) || position < 0 || position >= this.paragraphs.length) {
      throw new SalesTermsPositionOutOfRangeError(position, this.paragraphs.length);
    }
    const [moved] = this.paragraphs.splice(index, 1);
    if (moved !== undefined) {
      this.paragraphs.splice(position, 0, moved);
    }
  }

  /** L'état à persister. Une copie : personne ne mute le document par sa sortie. */
  snapshot(): SalesTerms {
    return { title: this.heading, paragraphs: [...this.paragraphs] };
  }

  private indexOf(id: string): number {
    const index = this.paragraphs.findIndex((paragraph) => paragraph.id === id);
    if (index === -1) {
      throw new UnknownSalesTermsParagraphError(id);
    }
    return index;
  }
}

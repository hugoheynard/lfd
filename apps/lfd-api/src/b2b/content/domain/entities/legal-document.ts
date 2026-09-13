import {
  MAX_LEGAL_DOCUMENT_PARAGRAPHS,
  type LegalDocument as LegalDocumentContent,
  type LegalDocumentHeading,
  type LegalDocumentParagraph,
  type LegalDocumentParagraphPayload,
} from "@lfd/contracts";

import {
  DuplicateLegalDocumentParagraphError,
  LegalDocumentFullError,
  LegalDocumentPositionOutOfRangeError,
  UnknownLegalDocumentParagraphError,
} from "../errors/legal-document-errors.js";

/**
 * **Un document de mention légale**, en tant qu'agrégat — mentions légales,
 * CGV, confidentialité, cookies ou accessibilité, indifféremment.
 *
 * Un seul agrégat pour les cinq, parce qu'ils ont la même forme et les mêmes
 * refus : ce qui les distingue est la CLÉ sous laquelle ils sont chargés et
 * enregistrés, pas leur comportement. Cinq classes auraient divergé au premier
 * correctif.
 *
 * Le pied de page voisin n'en a pas, et c'est juste : rien ne peut y refuser une
 * écriture, sa validité est une affaire de FORME que le schéma du contrat tient
 * au bord. Un document légal, lui, porte des refus qu'aucun schéma ne peut
 * exprimer — un article inconnu, un rang hors du document, une borne atteinte —
 * parce que tous trois dépendent de l'ÉTAT courant du document.
 *
 * Le cycle est celui du dépôt : `load → méthode métier → save`. Le port ne gagne
 * aucune écriture de champ à partir de primitives, sans quoi ces trois refus
 * repartiraient dans les handlers, où le prochain appelant ne les verrait pas.
 *
 * ⚠️ Le type du CONTRAT porte le même nom que cette classe et arrive ici sous
 * l'alias `LegalDocumentContent` : l'un est l'état stocké, l'autre le gardien
 * de ses transitions. Les distinguer par un alias local vaut mieux que de
 * déformer l'un des deux noms dans tout le dépôt.
 *
 * ⚠️ L'identifiant d'un article vient du port `IdGenerator` et arrive ici tout
 * frappé : l'agrégat ne fabrique rien, il n'a pas le droit de connaître le
 * temps ni l'aléa.
 */
export class LegalDocument {
  private constructor(
    private heading: LegalDocumentHeading,
    private readonly paragraphs: LegalDocumentParagraph[],
  ) {}

  /**
   * Rehydrate le document depuis le contenu stocké.
   *
   * Le contenu arrive **déjà relu par le schéma** (c'est l'adaptateur qui le
   * fait, parce que le domaine ne connaît pas Zod) : reconstituer, ici, c'est
   * reprendre la main sur les transitions, pas revalider la forme une seconde
   * fois avec une règle qui divergerait de la première.
   */
  static reconstitute(content: LegalDocumentContent): LegalDocument {
    return new LegalDocument(content.title, [...content.paragraphs]);
  }

  /** Renomme le document. Le titre sert aussi de libellé au lien de la boutique. */
  retitle(heading: LegalDocumentHeading): void {
    this.heading = heading;
  }

  /**
   * Ajoute un article **en fin de document** — l'ordre porte du sens, et une
   * insertion au milieu se dit en deux gestes : ajouter, puis déplacer.
   *
   * @throws {LegalDocumentFullError} le document a atteint sa borne.
   * @throws {DuplicateLegalDocumentParagraphError} l'identifiant est déjà pris.
   */
  addParagraph(id: string, prose: LegalDocumentParagraphPayload): void {
    if (this.paragraphs.length >= MAX_LEGAL_DOCUMENT_PARAGRAPHS) {
      throw new LegalDocumentFullError(MAX_LEGAL_DOCUMENT_PARAGRAPHS, this.heading.fr);
    }
    if (this.paragraphs.some((paragraph) => paragraph.id === id)) {
      throw new DuplicateLegalDocumentParagraphError(id, this.heading.fr);
    }
    this.paragraphs.push({ id, ...prose });
  }

  /**
   * Réécrit les trois langues d'un article. L'identifiant survit à la
   * réécriture : c'est lui que les routes désignent.
   *
   * @throws {UnknownLegalDocumentParagraphError} l'article n'existe pas.
   */
  editParagraph(id: string, prose: LegalDocumentParagraphPayload): void {
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
   * @throws {UnknownLegalDocumentParagraphError} l'article n'existe pas.
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
   * @throws {UnknownLegalDocumentParagraphError} l'article n'existe pas.
   * @throws {LegalDocumentPositionOutOfRangeError} le rang est hors du document.
   */
  moveParagraph(id: string, position: number): void {
    const index = this.indexOf(id);
    if (!Number.isInteger(position) || position < 0 || position >= this.paragraphs.length) {
      throw new LegalDocumentPositionOutOfRangeError(
        position,
        this.paragraphs.length,
        this.heading.fr,
      );
    }
    const [moved] = this.paragraphs.splice(index, 1);
    if (moved !== undefined) {
      this.paragraphs.splice(position, 0, moved);
    }
  }

  /** L'état à persister. Une copie : personne ne mute le document par sa sortie. */
  snapshot(): LegalDocumentContent {
    return { title: this.heading, paragraphs: [...this.paragraphs] };
  }

  private indexOf(id: string): number {
    const index = this.paragraphs.findIndex((paragraph) => paragraph.id === id);
    if (index === -1) {
      throw new UnknownLegalDocumentParagraphError(id, this.heading.fr);
    }
    return index;
  }
}

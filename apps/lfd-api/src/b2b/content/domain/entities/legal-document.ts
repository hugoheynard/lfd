import {
  MAX_LEGAL_DOCUMENT_PARAGRAPHS,
  requiredSections,
  type LegalDocument as LegalDocumentContent,
  type LegalDocumentHeading,
  type LegalDocumentParagraph,
  type LegalDocumentParagraphPayload,
  type LegalMention,
  type LegalSectionKey,
} from "@lfd/contracts";

import {
  DuplicateLegalDocumentParagraphError,
  LegalDocumentFullError,
  LegalDocumentPositionOutOfRangeError,
  LegalSectionAlreadyPresentError,
  LegalSectionNotRequiredError,
  RequiredLegalSectionRemovalError,
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
    private readonly mention: LegalMention,
    private heading: LegalDocumentHeading,
    private readonly paragraphs: LegalDocumentParagraph[],
    /**
     * La révision LUE au chargement. L'adaptateur conditionne l'écriture à
     * elle (§4.5, B2) : c'est ce qui empêche un écran périmé d'effacer le geste
     * d'un collègue. Toujours présente depuis le 2026-10-10 : elle a été
     * facultative (`null`, écriture non conditionnée) le temps d'une transition.
     */
    readonly revision: number,
  ) {}

  /**
   * Rehydrate le document depuis le contenu stocké.
   *
   * Le contenu arrive **déjà relu par le schéma** (c'est l'adaptateur qui le
   * fait, parce que le domaine ne connaît pas Zod) : reconstituer, ici, c'est
   * reprendre la main sur les transitions, pas revalider la forme une seconde
   * fois avec une règle qui divergerait de la première.
   *
   * La MENTION est ce qui dit quelles sections le document exige : un même
   * contenu n'a pas les mêmes refus sous `privacy` et sous `cookies`.
   */
  static reconstitute(
    mention: LegalMention,
    content: LegalDocumentContent,
    revision: number,
  ): LegalDocument {
    return new LegalDocument(mention, content.title, [...content.paragraphs], revision);
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
    this.assertRoomFor(id);
    this.paragraphs.push({ id, ...prose });
  }

  /**
   * Crée une **section requise** en fin de document, avec le texte que le
   * rédacteur a saisi — jamais un texte de départ (§4.5, S3) : un texte
   * juridique provisoire serait publié tel quel.
   *
   * @throws {LegalSectionNotRequiredError} la mention n'exige pas cette section.
   * @throws {LegalSectionAlreadyPresentError} le document la porte déjà.
   * @throws {LegalDocumentFullError} le document a atteint sa borne.
   * @throws {DuplicateLegalDocumentParagraphError} l'identifiant est déjà pris.
   */
  addRequiredSection(
    id: string,
    section: LegalSectionKey,
    prose: LegalDocumentParagraphPayload,
  ): void {
    if (!requiredSections(this.mention).includes(section)) {
      throw new LegalSectionNotRequiredError(section, this.heading.fr);
    }
    if (this.paragraphs.some((paragraph) => paragraph.section === section)) {
      throw new LegalSectionAlreadyPresentError(section, this.heading.fr);
    }
    this.assertRoomFor(id);
    this.paragraphs.push({ id, ...prose, section });
  }

  /**
   * Réécrit les trois langues d'un article. L'identifiant survit à la
   * réécriture : c'est lui que les routes désignent.
   *
   * @throws {UnknownLegalDocumentParagraphError} l'article n'existe pas.
   */
  editParagraph(id: string, prose: LegalDocumentParagraphPayload): void {
    const index = this.indexOf(id);
    const { section } = this.paragraphs[index] ?? {};
    // La clé de section SURVIT à la réécriture (§4.5, B1) : la reconstruire
    // depuis la seule charge utile l'effaçait, et la section redevenait
    // supprimable à sa première correction.
    this.paragraphs[index] = section === undefined ? { id, ...prose } : { id, ...prose, section };
  }

  /**
   * Retire un article.
   *
   * Pas d'archivage ici, à la différence d'un agrégat métier, et **pas
   * d'historique** : l'article supprimé disparaît du document, et seule la
   * `revision` de la ligne dit qu'un geste a eu lieu — ni son texte ni son
   * auteur ne se retrouvent après coup.
   *
   * Une section REQUISE ne se retire pas (§4.2) : son ancre est le lien donné
   * à des tiers.
   *
   * @throws {UnknownLegalDocumentParagraphError} l'article n'existe pas.
   * @throws {RequiredLegalSectionRemovalError} l'article est une section requise.
   */
  removeParagraph(id: string): void {
    const index = this.indexOf(id);
    const section = this.paragraphs[index]?.section;
    if (section !== undefined && requiredSections(this.mention).includes(section)) {
      throw new RequiredLegalSectionRemovalError(id, this.heading.fr);
    }
    this.paragraphs.splice(index, 1);
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

  private assertRoomFor(id: string): void {
    if (this.paragraphs.length >= MAX_LEGAL_DOCUMENT_PARAGRAPHS) {
      throw new LegalDocumentFullError(MAX_LEGAL_DOCUMENT_PARAGRAPHS, this.heading.fr);
    }
    if (this.paragraphs.some((paragraph) => paragraph.id === id)) {
      throw new DuplicateLegalDocumentParagraphError(id, this.heading.fr);
    }
  }

  private indexOf(id: string): number {
    const index = this.paragraphs.findIndex((paragraph) => paragraph.id === id);
    if (index === -1) {
      throw new UnknownLegalDocumentParagraphError(id, this.heading.fr);
    }
    return index;
  }
}

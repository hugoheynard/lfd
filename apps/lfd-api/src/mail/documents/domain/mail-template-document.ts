import {
  imageBlocksOf,
  imageCopiesOf,
  imageCopyKey,
  validateMailDocument,
  validateMailDocumentForPublication,
  withImageSources,
  type MailDocument,
  type MailTemplateDeclaration,
} from "@lfd/mail-blocks";

import {
  MailDocumentChangedError,
  MailDocumentImageNotCopiedError,
  MailDocumentRefusedError,
  NothingToRevertError,
} from "./mail-document-errors.js";

/** Un geste daté et signé — l'identifiant INTERNE de la fiche staff. */
export interface MailDocumentStamp {
  readonly at: Date;
  readonly staffId: string;
}

/** Un document publié : sa version, gardée en ajout seul, et qui l'a publié. */
export interface PublishedMailDocument {
  readonly document: MailDocument;
  readonly version: number;
  readonly stamp: MailDocumentStamp;
}

/** Le brouillon : le document, et son dernier geste. */
export interface MailDocumentDraft {
  readonly document: MailDocument;
  readonly stamp: MailDocumentStamp;
}

/** L'état complet, tel que l'adaptateur le range et le relit. */
export interface MailTemplateDocumentState {
  readonly template: string;
  /** 0 = jamais écrit (aucune ligne) : le document de départ. */
  readonly revision: number;
  readonly draft: MailDocumentDraft | null;
  readonly published: PublishedMailDocument | null;
  /** La dernière version posée : la suivante en part, même après un retrait. */
  readonly lastVersion: number;
  readonly retracted: MailDocumentStamp | null;
}

/** Le document que l'éditeur ouvre, et d'où il vient. */
export interface CurrentMailDocument {
  readonly document: MailDocument;
  readonly source: "draft" | "published" | "starting";
}

/**
 * **Le document d'un e-mail** — l'agrégat de son arrangement (plan
 * `plan-editeur-par-blocs.md`, § 5, S4c) : un brouillon, un publié, des
 * versions publiées qui ne se réécrivent jamais.
 *
 * Il refuse : un document que les règles du paquet refusent (à
 * l'enregistrement la forme, à la publication aussi un texte par langue du
 * modèle) ; toute écriture faite sur une révision que quelqu'un a dépassée ;
 * un retour au modèle d'origine qui n'aurait rien à retirer.
 *
 * Il ne porte JAMAIS une phrase du modèle : elles restent au dictionnaire
 * (§ 3), et « revenir au modèle d'origine » ne les touche pas.
 */
export class MailTemplateDocument {
  private appended: PublishedMailDocument | null = null;

  private constructor(
    private state: MailTemplateDocumentState,
    private readonly loaded: number,
  ) {}

  /** Un e-mail jamais arrangé : rien n'est écrit tant qu'on ne le modifie pas. */
  static untouched(template: string): MailTemplateDocument {
    return new MailTemplateDocument(
      { template, revision: 0, draft: null, published: null, lastVersion: 0, retracted: null },
      0,
    );
  }

  static reconstitute(state: MailTemplateDocumentState): MailTemplateDocument {
    return new MailTemplateDocument(state, state.revision);
  }

  get template(): string {
    return this.state.template;
  }

  /** La révision lue — la condition de l'écriture. */
  get loadedRevision(): number {
    return this.loaded;
  }

  /** La version publiée par CE geste, à ajouter à l'historique ; `null` sinon. */
  get appendedVersion(): PublishedMailDocument | null {
    return this.appended;
  }

  get hasDraft(): boolean {
    return this.state.draft !== null;
  }

  /** Le document que l'éditeur ouvre : le brouillon, sinon le publié, sinon celui de départ. */
  current(starting: MailDocument): CurrentMailDocument {
    if (this.state.draft !== null) {
      return { document: this.state.draft.document, source: "draft" };
    }
    if (this.state.published !== null) {
      return { document: this.state.published.document, source: "published" };
    }
    return { document: starting, source: "starting" };
  }

  /**
   * Enregistre le brouillon.
   *
   * @throws {MailDocumentChangedError} la révision lue est dépassée.
   * @throws {MailDocumentRefusedError} le document enfreint une règle de forme.
   */
  saveDraft(
    document: MailDocument,
    declaration: MailTemplateDeclaration,
    expectedRevision: number,
    stamp: MailDocumentStamp,
  ): void {
    this.assertRevision(expectedRevision);
    const violations = validateMailDocument(document, declaration, this.state.template);
    if (violations.length > 0) {
      throw new MailDocumentRefusedError(this.state.template, "enregistré", violations);
    }
    this.state = { ...this.state, revision: this.state.revision + 1, draft: { document, stamp } };
  }

  /**
   * Le brouillon tel qu'il serait publié, vérifié sans rien changer — ce que
   * la publication lit AVANT sa transaction pour en copier les images (S5d).
   * `null` sans brouillon.
   *
   * @throws {MailDocumentChangedError} la révision lue est dépassée.
   * @throws {MailDocumentRefusedError} une règle de publication est enfreinte.
   */
  publishableDraft(
    declaration: MailTemplateDeclaration,
    expectedRevision: number,
  ): MailDocument | null {
    this.assertRevision(expectedRevision);
    const draft = this.state.draft;
    if (draft === null) {
      return null;
    }
    const violations = validateMailDocumentForPublication(
      draft.document,
      declaration,
      this.state.template,
    );
    if (violations.length > 0) {
      throw new MailDocumentRefusedError(this.state.template, "publié", violations);
    }
    return draft.document;
  }

  /**
   * Publie le brouillon : il devient la version suivante, gardée en ajout
   * seul, où chaque image pointe vers sa copie (`imageCopies` : clé de copie
   * `imageCopyKey` — l'adresse d'origine, et le cadrage s'il y en a un →
   * adresse de la copie). Rend `null` sans brouillon — les
   * phrases de l'e-mail peuvent se publier seules.
   *
   * @throws {MailDocumentChangedError} la révision lue est dépassée.
   * @throws {MailDocumentRefusedError} un bloc libre n'a pas son texte dans
   *   une langue du modèle, ou une règle de forme est enfreinte.
   * @throws {MailDocumentImageNotCopiedError} une image n'a pas de copie.
   */
  publish(
    declaration: MailTemplateDeclaration,
    expectedRevision: number,
    stamp: MailDocumentStamp,
    imageCopies: ReadonlyMap<string, string> = new Map(),
  ): PublishedMailDocument | null {
    const draft = this.publishableDraft(declaration, expectedRevision);
    if (draft === null) {
      return null;
    }
    if (imageBlocksOf(draft).some((image) => !imageCopies.has(imageCopyKey(image)))) {
      throw new MailDocumentImageNotCopiedError(this.state.template);
    }
    const published = {
      document: withImageSources(draft, imageCopies),
      version: this.state.lastVersion + 1,
      stamp,
    };
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      draft: null,
      published,
      lastVersion: published.version,
    };
    this.appended = published;
    return published;
  }

  /** La version publiée qui part aujourd'hui ; `null` : le document de départ. */
  /**
   * Les copies de la version publiée (clé `imageCopyKey` → adresse) : une
   * image republiée sans changer de source ni de cadrage ne se recopie pas.
   */
  get publishedImageCopies(): ReadonlyMap<string, string> {
    return this.state.published === null ? new Map() : imageCopiesOf(this.state.published.document);
  }

  get publishedVersion(): number | null {
    return this.state.published?.version ?? null;
  }

  /**
   * « Revenir au modèle d'origine » : le document publié est retiré et le
   * brouillon effacé ; l'e-mail repart dans son arrangement de départ. Rend la
   * version retirée, `null` s'il n'y avait qu'un brouillon.
   *
   * @throws {MailDocumentChangedError} la révision lue est dépassée.
   * @throws {NothingToRevertError} ni publié, ni brouillon.
   */
  revert(expectedRevision: number, stamp: MailDocumentStamp): number | null {
    this.assertRevision(expectedRevision);
    if (this.state.published === null && this.state.draft === null) {
      throw new NothingToRevertError(this.state.template);
    }
    const retracted = this.publishedVersion;
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      draft: null,
      published: null,
      retracted: stamp,
    };
    return retracted;
  }

  snapshot(): MailTemplateDocumentState {
    return this.state;
  }

  private assertRevision(expectedRevision: number): void {
    if (expectedRevision !== this.state.revision) {
      throw new MailDocumentChangedError(this.state.template);
    }
  }
}

import { type ResupplyTemplateContent, templateContentOf } from "./resupply-template-content.js";
import {
  ResupplyTemplateArchivedError,
  ResupplyTemplateChangedMeanwhileError,
  ResupplyTemplateKeyTakenError,
} from "./resupply-template-errors.js";
import type { ResupplyTrace } from "./resupply-trace.js";

export type { ResupplyTemplateContent } from "./resupply-template-content.js";

/** L'état persisté d'un modèle. */
export interface ResupplyTemplateSnapshot {
  readonly id: string;
  readonly siteId: string;
  /** La version écrite ; 0 pour un modèle pas encore écrit. */
  readonly version: number;
  readonly content: ResupplyTemplateContent;
  readonly created: ResupplyTrace;
  /** Le dernier ajustement (la création comprise). */
  readonly updated: ResupplyTrace;
  /** L'archivage ; `null` tant qu'il est actif. */
  readonly archived: ResupplyTrace | null;
}

/**
 * **Un modèle de réassort** (plan
 * `documentation/reassort-boutiques/commander.md § 6`) — un
 * raccourci de saisie d'un point, jetable : aucun réassort ne le référence,
 * et il ne garde pas d'historique.
 *
 * Ce qu'il garantit : un contenu valide ({@link templateContentOf}), un point
 * figé à la création (le contenu n'en porte pas), une écriture seulement tant
 * qu'il est actif et sous la version LUE, et un archivage une fois. L'unicité
 * du nom parmi les modèles actifs du point est tenue par la base (index
 * partiel), que l'adaptateur traduit. Jamais supprimé.
 */
export class ResupplyTemplate {
  private constructor(
    readonly id: string,
    readonly siteId: string,
    /**
     * La version LUE en base (`0` : pas encore écrite). Elle n'avance pas en
     * mémoire : l'adaptateur écrit `version + 1` sous ce verrou, comme le
     * brouillon du fournil.
     */
    readonly version: number,
    private currentContent: ResupplyTemplateContent,
    readonly created: ResupplyTrace,
    private updatedTrace: ResupplyTrace,
    private archivedTrace: ResupplyTrace | null,
  ) {}

  /** « Enregistrer comme modèle » : un modèle neuf du point. */
  static create(input: {
    readonly id: string;
    readonly siteId: string;
    readonly content: ResupplyTemplateContent;
    readonly trace: ResupplyTrace;
  }): ResupplyTemplate {
    const content = templateContentOf(input.content);
    return new ResupplyTemplate(input.id, input.siteId, 0, content, input.trace, input.trace, null);
  }

  /** Réhydrate un modèle relu ; son contenu revalide. */
  static restore(snapshot: ResupplyTemplateSnapshot): ResupplyTemplate {
    return new ResupplyTemplate(
      snapshot.id,
      snapshot.siteId,
      snapshot.version,
      templateContentOf(snapshot.content),
      snapshot.created,
      snapshot.updated,
      snapshot.archived,
    );
  }

  get content(): ResupplyTemplateContent {
    return this.currentContent;
  }

  get updated(): ResupplyTrace {
    return this.updatedTrace;
  }

  get archived(): ResupplyTrace | null {
    return this.archivedTrace;
  }

  /** La version que l'écriture en cours posera : celle que l'écran relira. */
  get nextVersion(): number {
    return this.version + 1;
  }

  /**
   * La même clé de création rejouée : rendre ce modèle n'a de sens que pour
   * le point qui l'a créé.
   *
   * @throws {ResupplyTemplateKeyTakenError} la clé est celle d'un modèle d'un autre point.
   */
  assertReplayableFor(siteId: string): void {
    if (siteId !== this.siteId) {
      throw new ResupplyTemplateKeyTakenError(this.id);
    }
  }

  /**
   * Ajuster : le contenu ENTIER remplace le précédent, sous la version lue.
   *
   * @throws {ResupplyTemplateArchivedError} le modèle est archivé.
   * @throws {ResupplyTemplateChangedMeanwhileError} un autre poste l'a écrit depuis.
   */
  adjust(content: ResupplyTemplateContent, seenVersion: number, trace: ResupplyTrace): void {
    this.ensureActive();
    if (seenVersion !== this.version) {
      throw new ResupplyTemplateChangedMeanwhileError();
    }
    this.currentContent = templateContentOf(content);
    this.updatedTrace = trace;
  }

  /**
   * Archiver, une fois : le modèle quitte la bibliothèque et son nom
   * redevient libre. Jamais une suppression.
   *
   * @throws {ResupplyTemplateArchivedError} déjà archivé.
   */
  archive(trace: ResupplyTrace): void {
    this.ensureActive();
    this.archivedTrace = trace;
    this.updatedTrace = trace;
  }

  /**
   * Appliquer à une demande : un modèle archivé ne remplit plus rien.
   *
   * @throws {ResupplyTemplateArchivedError} le modèle est archivé.
   */
  assertApplicable(): void {
    this.ensureActive();
  }

  snapshot(): ResupplyTemplateSnapshot {
    return {
      id: this.id,
      siteId: this.siteId,
      version: this.version,
      content: this.currentContent,
      created: this.created,
      updated: this.updatedTrace,
      archived: this.archivedTrace,
    };
  }

  private ensureActive(): void {
    if (this.archivedTrace !== null) {
      throw new ResupplyTemplateArchivedError(this.id);
    }
  }
}

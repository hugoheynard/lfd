import type { LocalizedText } from "@lfd/pim-contracts";

import { OfficialAllergenEntryLockedError } from "../errors/allergen-errors.js";
import { AllergenCode } from "../value-objects/allergen-code.js";
import { cleanLabel } from "../value-objects/allergen-label.js";

/** Ce qu'une entrée **maison** demande pour naître. */
export interface NewAllergenEntryInput {
  readonly id: string;
  readonly code: string;
  readonly name: LocalizedText;
  /** L'identifiant technique de la catégorie qui l'accueille. */
  readonly categoryId: string;
}

/**
 * Ce qu'un geste de réglage porte : un champ **absent ou indéfini** vaut « ne
 * touche pas à ça ».
 *
 * Écrit à la main plutôt qu'un `Partial` : sous `exactOptionalPropertyTypes`,
 * celui-ci refuserait le `undefined` explicite qu'un contrôleur transmet pour
 * un champ non envoyé. Même raison qu'ailleurs dans le référentiel.
 */
export interface AllergenEntryPatch {
  readonly name?: LocalizedText | undefined;
  readonly categoryId?: string | undefined;
}

/** L'état d'une entrée, tel qu'il part en base. */
export interface AllergenEntrySnapshot {
  readonly id: string;
  readonly code: string;
  readonly name: LocalizedText;
  readonly categoryId: string;
  readonly official: boolean;
  readonly archivedAt: Date | null;
}

/**
 * **Une entrée du référentiel d'allergènes — l'agrégat.**
 *
 * Ce qu'elle garantit :
 *
 * - **le code est une identité**, jamais réécrite : les déclarations
 *   réglementaires déjà enregistrées le citent en clair, et le changer
 *   réécrirait des étiquettes que personne n'a rouvertes ;
 * - **une entrée officielle est inaltérable** — ni libellé, ni rattachement, ni
 *   archivage. C'est du droit : on ne l'invente pas, on l'enregistre ;
 * - **rien ne s'efface** : une entrée maison sort du référentiel par
 *   `archive()`, jamais par un DELETE — un ingrédient peut la citer, et la base
 *   le refuserait de toute façon (FK `Restrict`).
 *
 * **Double verrou sur l'archivage, et c'est voulu.**
 * `allergen_entry_official_lock` gèle `archived_at` au même titre que `code`,
 * `category_id`, `name` et `official` — archiver une entrée officielle, c'est
 * la faire disparaître du référentiel, donc la supprimer au sens de la maison.
 * {@link archive} refuse **avant** la base pour que le staff lise un motif
 * métier plutôt qu'une `restrict_violation` Postgres.
 *
 * Ce qu'elle ne peut pas voir, et qui reste au handler : qu'aucune AUTRE entrée
 * ne porte ce code, et que la catégorie visée existe.
 */
export class AllergenEntry {
  private constructor(
    private readonly identity: string,
    private readonly codeValue: AllergenCode,
    private nameValue: LocalizedText,
    private categoryValue: string,
    private readonly officialValue: boolean,
    private archivedAtValue: Date | null,
  ) {}

  /**
   * Déclare une entrée **maison** — la seule qu'un back-office puisse créer.
   *
   * `official` n'est pas un paramètre : les 30 codes GS1 naissent d'une
   * migration semée, et une entrée que le staff crée ne peut pas se hisser au
   * rang de code réglementaire.
   */
  static declare(input: NewAllergenEntryInput): AllergenEntry {
    return new AllergenEntry(
      input.id,
      AllergenCode.create(input.code),
      cleanLabel("l'allergène", input.name),
      input.categoryId,
      false,
      null,
    );
  }

  /**
   * Reconstitue depuis la base. Le code **repasse par son value object** : une
   * ligne écrite hors du domaine se signale ici plutôt que de ressortir telle
   * quelle vers un export GDSN.
   */
  static reconstitute(snapshot: AllergenEntrySnapshot): AllergenEntry {
    return new AllergenEntry(
      snapshot.id,
      AllergenCode.create(snapshot.code),
      snapshot.name,
      snapshot.categoryId,
      snapshot.official,
      snapshot.archivedAt,
    );
  }

  get id(): string {
    return this.identity;
  }

  get code(): string {
    return this.codeValue.value;
  }

  get categoryId(): string {
    return this.categoryValue;
  }

  get isOfficial(): boolean {
    return this.officialValue;
  }

  get isArchived(): boolean {
    return this.archivedAtValue !== null;
  }

  /**
   * Règle ce qui est réglable. Le code n'y figure pas — c'est une identité.
   *
   * @throws {OfficialAllergenEntryLockedError} l'entrée est du droit.
   */
  revise(patch: AllergenEntryPatch): void {
    this.refuseIfOfficial();
    if (patch.name !== undefined) {
      this.nameValue = cleanLabel("l'allergène", patch.name);
    }
    if (patch.categoryId !== undefined) {
      this.categoryValue = patch.categoryId;
    }
  }

  /**
   * Retire l'entrée du référentiel sans l'effacer.
   *
   * **Idempotent, et la première date gagne** : l'archivage répond à « depuis
   * quand cette entrée n'est plus proposée », et réécrire la date à chaque
   * clic répondrait « depuis le dernier clic ».
   *
   * @param at l'instant du geste — il vient du port `Clock`, jamais d'un
   *   `new Date()` : le domaine reste déterministe.
   * @throws {OfficialAllergenEntryLockedError} archiver du droit, c'est le
   *   supprimer.
   */
  archive(at: Date): void {
    this.refuseIfOfficial();
    if (this.archivedAtValue === null) {
      this.archivedAtValue = at;
    }
  }

  /**
   * Remet l'entrée au référentiel.
   *
   * @throws {OfficialAllergenEntryLockedError} une entrée officielle n'a jamais
   *   quitté le référentiel — la restaurer n'aurait rien à remettre, et
   *   toucherait quand même une ligne du droit.
   */
  restore(): void {
    this.refuseIfOfficial();
    this.archivedAtValue = null;
  }

  snapshot(): AllergenEntrySnapshot {
    return {
      id: this.identity,
      code: this.codeValue.value,
      name: this.nameValue,
      categoryId: this.categoryValue,
      official: this.officialValue,
      archivedAt: this.archivedAtValue,
    };
  }

  private refuseIfOfficial(): void {
    if (this.officialValue) {
      throw new OfficialAllergenEntryLockedError(this.codeValue.value);
    }
  }
}

import type { LocalizedText } from "@lfd/pim-contracts";

import {
  AllergenPositionInvalidError,
  OfficialAllergenCategoryLockedError,
} from "../errors/allergen-errors.js";
import { AllergenCategoryKey } from "../value-objects/allergen-category-key.js";
import { cleanLabel } from "../value-objects/allergen-label.js";
import { toIncoCategory, type IncoCategory } from "../value-objects/inco-category.js";

/** Ce qu'une catégorie **maison** demande pour naître. */
export interface NewAllergenCategoryInput {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  readonly position: number;
}

/** L'état d'une catégorie, tel qu'il part en base. */
export interface AllergenCategorySnapshot {
  readonly id: string;
  readonly key: string;
  readonly name: LocalizedText;
  readonly incoCategory: IncoCategory | null;
  readonly official: boolean;
  readonly position: number;
  readonly archivedAt: Date | null;
}

/**
 * Ce que la base rend : `inco_category` y est une colonne **texte**.
 *
 * Deux formes plutôt qu'une pour que le passage de l'une à l'autre soit le
 * travail de l'agrégat et de personne d'autre. Sans elle, l'adaptateur devrait
 * affirmer par une assertion qu'une colonne libre porte une valeur de l'union —
 * exactement ce que D1 cherche à empêcher.
 */
export interface AllergenCategoryState extends Omit<AllergenCategorySnapshot, "incoCategory"> {
  readonly incoCategory: string | null;
}

/**
 * **Une catégorie d'allergène — l'agrégat.**
 *
 * Elle porte deux invariants que ni un formulaire ni une colonne ne peuvent
 * tenir :
 *
 * - **une catégorie maison n'est jamais réglementaire.** `declare()` ne prend
 *   pas de `incoCategory` et n'en pose jamais : la règle n'est pas vérifiée,
 *   elle est INEXPRIMABLE. C'est ce qui garantit qu'une catégorie créée à
 *   l'écran ne pourra pas se faire passer pour une mention de l'annexe II sur
 *   une étiquette UE ;
 * - **une catégorie officielle ne se renomme pas.** Son libellé EST la mention
 *   légale. Le trigger le tient en base ; l'agrégat le refuse avant, pour que
 *   le staff lise une raison plutôt qu'un code d'erreur Postgres.
 *
 * Le rang d'affichage échappe aux deux, et c'est délibéré — voir
 * {@link moveTo}.
 *
 * **Rien ne s'efface, ici non plus.** Une catégorie maison sort du référentiel
 * par {@link archive}, jamais par un DELETE : une entrée peut la citer, et la
 * FK `Restrict` le refuserait de toute façon. Le trigger
 * `allergen_category_official_lock` gèle `archived_at` au même titre que `key`,
 * `name`, `inco_category` et `official` — archiver une catégorie de l'annexe II,
 * ce serait retirer une mention d'étiquette sans le dire. {@link archive} refuse
 * **avant** la base pour que le staff lise un motif métier plutôt qu'une
 * `restrict_violation` Postgres.
 *
 * Ce qu'elle ne peut pas voir, et qui reste au handler : qu'aucune AUTRE
 * catégorie ne porte cette clé, et qu'aucune entrée ne la cite au moment de
 * l'effacer.
 */
export class AllergenCategory {
  private constructor(
    private readonly identity: string,
    private readonly keyValue: AllergenCategoryKey,
    private nameValue: LocalizedText,
    private readonly incoValue: IncoCategory | null,
    private readonly officialValue: boolean,
    private positionValue: number,
    private archivedAtValue: Date | null,
  ) {}

  /**
   * Déclare une catégorie **maison** — la seule qu'un back-office puisse créer.
   *
   * `official` et `incoCategory` ne sont pas des paramètres : l'officiel naît
   * d'une migration semée, jamais d'une saisie (« l'annexe II ne s'étend pas
   * depuis le back-office »).
   */
  static declare(input: NewAllergenCategoryInput): AllergenCategory {
    return new AllergenCategory(
      input.id,
      AllergenCategoryKey.create(input.key),
      cleanLabel("la catégorie d'allergène", input.name),
      null,
      false,
      requirePosition(input.position),
      null,
    );
  }

  /**
   * Reconstitue depuis la base. La clé et la catégorie INCO **repassent par
   * leur garde** : une ligne écrite hors du domaine — un `psql`, une migration
   * correctrice — se signale ici plutôt que de ressortir vers une étiquette.
   */
  static reconstitute(state: AllergenCategoryState): AllergenCategory {
    return new AllergenCategory(
      state.id,
      AllergenCategoryKey.create(state.key),
      state.name,
      toIncoCategory(state.incoCategory),
      state.official,
      state.position,
      state.archivedAt,
    );
  }

  get id(): string {
    return this.identity;
  }

  get key(): string {
    return this.keyValue.value;
  }

  get isOfficial(): boolean {
    return this.officialValue;
  }

  get isArchived(): boolean {
    return this.archivedAtValue !== null;
  }

  /** La catégorie de l'annexe II, ou `null` — c'est elle qui autorise la projection INCO. */
  get incoCategory(): IncoCategory | null {
    return this.incoValue;
  }

  /**
   * Renomme — le seul geste d'édition d'une catégorie.
   *
   * La clé n'y figure pas (c'est une identité), `incoCategory` non plus (une
   * catégorie ne devient pas réglementaire par un `PATCH`).
   *
   * @throws {OfficialAllergenCategoryLockedError} la catégorie est du droit.
   */
  rename(name: LocalizedText): void {
    this.refuseIfOfficial();
    this.nameValue = cleanLabel("la catégorie d'allergène", name);
  }

  /**
   * Range la catégorie dans l'écran. **Autorisé même sur l'officiel** : l'ordre
   * d'affichage n'a aucune portée réglementaire, et le trigger laisse
   * `position` libre pour cette raison exacte.
   */
  moveTo(position: number): void {
    this.positionValue = requirePosition(position);
  }

  /**
   * Retire la catégorie du référentiel sans l'effacer.
   *
   * **Idempotent, et la première date gagne** : l'archivage répond à « depuis
   * quand cette catégorie n'est plus proposée », et réécrire la date à chaque
   * clic répondrait « depuis le dernier clic ». Un {@link restore} remet le
   * compteur à zéro — le prochain archivage reprend donc une date fraîche.
   *
   * Ce que l'agrégat ne peut pas voir, et qui reste au handler : qu'aucune
   * entrée encore proposée ne la cite. La FK `Restrict` ne protège que de
   * l'effacement, pas d'un archivage qui laisserait ses entrées sans famille.
   *
   * @param at l'instant du geste — il vient du port `Clock`, jamais d'un
   *   `new Date()` : le domaine reste déterministe.
   * @throws {OfficialAllergenCategoryLockedError} archiver du droit, c'est le
   *   supprimer.
   */
  archive(at: Date): void {
    this.refuseIfOfficial();
    if (this.archivedAtValue === null) {
      this.archivedAtValue = at;
    }
  }

  /**
   * Remet la catégorie au référentiel.
   *
   * @throws {OfficialAllergenCategoryLockedError} une catégorie officielle n'a
   *   jamais quitté le référentiel — la restaurer n'aurait rien à remettre, et
   *   toucherait quand même une ligne du droit.
   */
  restore(): void {
    this.refuseIfOfficial();
    this.archivedAtValue = null;
  }

  snapshot(): AllergenCategorySnapshot {
    return {
      id: this.identity,
      key: this.keyValue.value,
      name: this.nameValue,
      incoCategory: this.incoValue,
      official: this.officialValue,
      position: this.positionValue,
      archivedAt: this.archivedAtValue,
    };
  }

  private refuseIfOfficial(): void {
    if (this.officialValue) {
      throw new OfficialAllergenCategoryLockedError(this.keyValue.value);
    }
  }
}

function requirePosition(position: number): number {
  if (!Number.isInteger(position) || position < 0) {
    throw new AllergenPositionInvalidError(position);
  }
  return position;
}

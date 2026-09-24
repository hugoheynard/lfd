import {
  assertDistinctIds,
  assertDistinctPages,
  assertDistinctTemplateNames,
  assertPlacements,
} from "./composition-rules.js";
import { diffStorefront, type StorefrontChanges } from "./storefront-changes.js";
import {
  StorefrontChangedError,
  StorefrontNotComposedError,
  StorefrontObjectUnknownError,
} from "./storefront-errors.js";
import {
  StorefrontObject,
  type StorefrontObjectInput,
  type StorefrontObjectState,
} from "./storefront-object.js";
import { StorefrontPage, type StorefrontPageState } from "./storefront-page.js";
import {
  StorefrontTemplate,
  type StorefrontTemplateInput,
  type StorefrontTemplateState,
} from "./storefront-template.js";

/**
 * La vitrine telle qu'on la charge : objets VIVANTS seulement. Objets et
 * gabarits y sont des ENTRÉES — leurs listes fermées en chaînes, que les value
 * objects revalident.
 */
export interface StorefrontState {
  /** `0` : jamais enregistrée. */
  readonly revision: number;
  readonly updatedAt: Date | null;
  readonly pages: readonly StorefrontPageState[];
  readonly objects: readonly StorefrontObjectInput[];
  readonly templates: readonly StorefrontTemplateInput[];
}

/** Un objet ou un gabarit proposé : `isNew` s'il vient d'être identifié par le serveur. */
export interface Proposed<T> {
  readonly value: T;
  readonly isNew: boolean;
}

/** Ce que l'éditeur renvoie : la vitrine ENTIÈRE, et la révision qu'il avait chargée. */
export interface StorefrontComposition {
  readonly expectedRevision: number;
  readonly pages: readonly StorefrontPage[];
  readonly objects: readonly Proposed<StorefrontObject>[];
  readonly templates: readonly Proposed<StorefrontTemplate>[];
}

/** Qui enregistre, et quand. `staffId` : la fiche INTERNE, jamais un `sub`. */
export interface StorefrontSaving {
  readonly at: Date;
  readonly staffId: string;
}

/** Ce que l'adaptateur écrit après un `compose()`. */
export interface StorefrontWrite {
  /** La révision chargée : le verrou de l'upsert conditionnel (D6). */
  readonly expectedRevision: number;
  readonly revision: number;
  readonly updatedAt: Date;
  readonly updatedByStaffId: string;
  readonly pages: readonly StorefrontPageState[];
  readonly objects: readonly StorefrontObjectState[];
  readonly templates: readonly StorefrontTemplateState[];
  /** Les objets vivants absents de la composition : archivés, jamais supprimés. */
  readonly archivedObjectIds: readonly string[];
}

/**
 * **La vitrine** — l'agrégat entier : pages, objets, gabarits (plan, D2).
 *
 * Entière, parce qu'un objet partagé paraît sur N rayons à la même position,
 * et que la collision se vérifie sur chacun : deux agrégats « page » ne
 * pourraient pas garder cet invariant ensemble.
 *
 * 🔴 **Son verrou est global**, et c'est assumé (D2) : deux personnes qui
 * éditent deux rayons différents se refusent l'une l'autre. L'équipe qui
 * compose tient en une ou deux personnes ; un verrou par rayon se paierait
 * tous les jours pour un conflit rare.
 *
 * La vérification de révision faite ICI ne suffit pas, et ne prétend pas
 * suffire : deux enregistrements qui chargent la même révision la passent
 * tous les deux. Le vrai verrou est l'upsert conditionnel de l'adaptateur,
 * dans la transaction (D6). Celle-ci épargne seulement une transaction
 * d'écriture à un éditeur déjà en retard.
 */
export class Storefront {
  private saving: (StorefrontSaving & { readonly archived: readonly string[] }) | null = null;

  private constructor(
    private readonly loadedRevision: number,
    private readonly updatedAt: Date | null,
    private pages: readonly StorefrontPage[],
    private objects: readonly StorefrontObject[],
    private templates: readonly StorefrontTemplate[],
  ) {}

  /**
   * Rehydrate depuis la base. Tout repasse par les value objects ET par les
   * règles d'ensemble : une base qui aurait dérivé le dit ici, pas à
   * l'affichage.
   */
  static reconstitute(state: StorefrontState): Storefront {
    const pages = state.pages.map((page) => StorefrontPage.of(page));
    const objects = state.objects.map((object) => StorefrontObject.of(object));
    const templates = state.templates.map((template) => StorefrontTemplate.of(template));
    assertPlacements(objects, pages);
    return new Storefront(state.revision, state.updatedAt, pages, objects, templates);
  }

  get revision(): number {
    return this.saving === null ? this.loadedRevision : this.loadedRevision + 1;
  }

  /** Les identifiants des objets vivants — ceux qu'une composition peut citer. */
  knows(id: string): boolean {
    return this.objects.some((object) => object.id === id);
  }

  /**
   * **Remplace la composition** par celle de l'éditeur, ou la refuse.
   *
   * Un objet absent est ARCHIVÉ, pas supprimé (D6). Pages et gabarits, eux,
   * sont des parties de la valeur de la vitrine : ils sont remplacés.
   *
   * @throws {StorefrontChangedError} la révision chargée n'est plus la courante.
   * @throws {StorefrontObjectUnknownError} un identifiant cité n'est pas dans la vitrine.
   * @throws {InvalidStorefrontError} doublon, chevauchement, débordement, rayon sans page.
   */
  compose(composition: StorefrontComposition, saving: StorefrontSaving): StorefrontChanges {
    if (composition.expectedRevision !== this.loadedRevision) {
      throw new StorefrontChangedError(this.updatedAt);
    }
    const objects = composition.objects.map((proposed) => proposed.value);
    const templates = composition.templates.map((proposed) => proposed.value);
    this.assertKnown(composition);
    assertDistinctPages(composition.pages);
    assertDistinctIds(
      objects.map((object) => object.id),
      "objet",
    );
    assertDistinctIds(
      templates.map((template) => template.id),
      "gabarit",
    );
    assertDistinctTemplateNames(templates);
    assertPlacements(objects, composition.pages);
    const changes = diffStorefront(
      { pages: this.pages, objects: this.objects },
      { pages: composition.pages, objects },
    );
    this.pages = composition.pages;
    this.objects = objects;
    this.templates = templates;
    this.saving = { ...saving, archived: changes.archived };
    return changes;
  }

  /** @throws {StorefrontNotComposedError} rien n'a été composé : il n'y a rien à écrire. */
  toPersistence(): StorefrontWrite {
    if (this.saving === null) {
      throw new StorefrontNotComposedError();
    }
    return {
      expectedRevision: this.loadedRevision,
      revision: this.loadedRevision + 1,
      updatedAt: this.saving.at,
      updatedByStaffId: this.saving.staffId,
      pages: this.pages.map((page) => page.state),
      objects: this.objects.map((object) => object.state),
      templates: this.templates.map((template) => template.state),
      archivedObjectIds: this.saving.archived,
    };
  }

  private assertKnown(composition: StorefrontComposition): void {
    const knownTemplates = new Set(this.templates.map((template) => template.id));
    for (const { value, isNew } of composition.objects) {
      if (!isNew && !this.knows(value.id)) {
        throw new StorefrontObjectUnknownError("objet", value.id);
      }
    }
    for (const { value, isNew } of composition.templates) {
      if (!isNew && !knownTemplates.has(value.id)) {
        throw new StorefrontObjectUnknownError("gabarit", value.id);
      }
    }
  }
}

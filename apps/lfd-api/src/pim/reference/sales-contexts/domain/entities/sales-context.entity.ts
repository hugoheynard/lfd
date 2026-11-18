import {
  RootSalesContextProtectedError,
  SalesContextInUseError,
  SalesContextKeyInvalidError,
  SalesContextLabelRequiredError,
} from "../errors/sales-context-errors.js";
import { isRootContext } from "../value-objects/bootstrap-contexts.js";
import type { SalesContext } from "../value-objects/sales-context.js";

/** L'état d'un contexte tel qu'il part en base : le registre, plus son archive. */
export interface SalesContextState extends SalesContext {
  /** `null` = en service ou hors service, mais pas archivé. */
  readonly archivedAt: Date | null;
}

/** Ce qu'une révision remplace — tout ce qui est réglable, d'un bloc. */
export interface SalesContextRevision {
  readonly label: string;
  readonly active: boolean;
  readonly position: number;
}

export interface NewSalesContextInput extends SalesContextRevision {
  readonly id: string;
  readonly key: string;
}

/**
 * **Un contexte de vente — l'agrégat.**
 *
 * C'était une donnée en lecture seule, posée par migration, et c'était cohérent
 * tant que le code portait la liste des trois canaux connus : en créer un
 * quatrième n'aurait servi à rien, il était écarté en silence. Ce verrou est
 * tombé (C0-d), et la promesse de C0 — « ajouter un contexte de vente est une
 * ligne, zéro code » — n'a plus de raison de s'arrêter au bord de l'écran.
 *
 * Ce qu'il garantit, et qu'un formulaire ne peut pas :
 *
 * - **la clé est une identité**, pas un libellé. Trois tables la citent par clé
 *   étrangère et les taux voyagent par elle ; elle a une forme, et elle ne
 *   change jamais ;
 * - **la racine est intouchable**, sauf pour être mise hors service.
 *
 * - **un contexte qui porte des taux ne s'archive pas** — le compte lui est
 *   apporté par un port d'usage, la règle est ici.
 *
 * Il ne se supprime pas (décision de Hugo du 2026-11-18, même jamais utilisé) :
 * archivé, il ne se propose plus (`SalesContextRegistry.active` l'écarte) et se
 * restaure. Ce qu'il ne peut pas voir, et qui reste au handler : qu'aucun AUTRE
 * contexte ne porte cette clé.
 */
export class SalesContextAggregate {
  private constructor(
    private readonly identity: string,
    private readonly keyValue: string,
    private labelValue: string,
    private activeValue: boolean,
    private positionValue: number,
    private archivedAtValue: Date | null,
  ) {}

  static open(input: NewSalesContextInput): SalesContextAggregate {
    return new SalesContextAggregate(
      input.id,
      requireKey(input.key),
      requireLabel(input.label),
      input.active,
      input.position,
      null,
    );
  }

  static reconstitute(snapshot: SalesContextState): SalesContextAggregate {
    return new SalesContextAggregate(
      snapshot.id,
      snapshot.key,
      snapshot.label,
      snapshot.active,
      snapshot.position,
      snapshot.archivedAt,
    );
  }

  get key(): string {
    return this.keyValue;
  }

  get isRoot(): boolean {
    return isRootContext(this.keyValue);
  }

  /**
   * Révise ce qui est réglable. La clé et la portée n'y figurent pas — ce ne
   * sont pas des réglages.
   *
   * La racine passe par ici comme les autres : son libellé, sa position et son
   * état de service lui appartiennent. Ineffaçable ne veut pas dire immuable.
   */
  revise(revision: SalesContextRevision): void {
    this.labelValue = requireLabel(revision.label);
    this.activeValue = revision.active;
    this.positionValue = revision.position;
  }

  get isArchived(): boolean {
    return this.archivedAtValue !== null;
  }

  /**
   * Archive le contexte : il ne se propose plus, ni au réglage d'un taux, ni à
   * la facturation.
   *
   * @param ratedBy taux réglés dessus, famille ou fiche, lus par le port
   *   d'usage (`SalesContextUsageReader`).
   * @returns `false` s'il était déjà archivé — le geste rejoué ne change rien.
   * @throws {RootSalesContextProtectedError} la racine ne s'archive pas.
   * @throws {SalesContextInUseError} des taux y sont encore réglés.
   */
  archive(at: Date, ratedBy: number): boolean {
    if (this.isRoot) {
      throw new RootSalesContextProtectedError("être archivé");
    }
    if (this.archivedAtValue !== null) {
      return false;
    }
    if (ratedBy > 0) {
      throw new SalesContextInUseError(this.keyValue);
    }
    this.archivedAtValue = at;
    return true;
  }

  /** Remet le contexte au registre. `false` s'il n'était pas archivé. */
  restore(): boolean {
    if (this.archivedAtValue === null) {
      return false;
    }
    this.archivedAtValue = null;
    return true;
  }

  snapshot(): SalesContextState {
    return {
      id: this.identity,
      key: this.keyValue,
      label: this.labelValue,
      active: this.activeValue,
      position: this.positionValue,
      archivedAt: this.archivedAtValue,
    };
  }
}

/**
 * La clé est l'identité que le reste du référentiel cite (les prix publics
 * par contexte voyagent par elle). Une forme stricte évite
 * qu'un espace ou une majuscule en fasse deux identités pour un seul contexte.
 */
const KEY_SHAPE = /^[a-z][a-zA-Z0-9-]*$/u;

function requireKey(raw: string): string {
  const trimmed = raw.trim();
  if (!KEY_SHAPE.test(trimmed)) {
    throw new SalesContextKeyInvalidError(raw);
  }
  return trimmed;
}

function requireLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new SalesContextLabelRequiredError();
  }
  return trimmed;
}

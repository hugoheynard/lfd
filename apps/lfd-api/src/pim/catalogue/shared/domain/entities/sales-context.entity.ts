import {
  RootSalesContextProtectedError,
  SalesContextKeyInvalidError,
  SalesContextLabelRequiredError,
  SalesContextScopeFrozenError,
} from "../errors/sales-context-errors.js";
import { isRootContext } from "../value-objects/bootstrap-contexts.js";
import type { SalesContext } from "../value-objects/sales-context.js";

/** Ce qu'une révision remplace — tout ce qui est réglable, d'un bloc. */
export interface SalesContextRevision {
  readonly label: string;
  readonly handleSuffix: string;
  readonly active: boolean;
  readonly shopifyProjected: boolean;
  readonly position: number;
}

export interface NewSalesContextInput extends SalesContextRevision {
  readonly id: string;
  readonly key: string;
  readonly perLocation: boolean;
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
 * - **la portée est figée** après la création. `perLocation` décide de la FORME
 *   des lignes déjà écrites — un contexte vendu depuis des lieux porte des
 *   paires `(lieu, contexte)`, un contexte global des paires `(∅, contexte)`.
 *   Le basculer laisserait les anciennes dans une forme que plus rien ne lit ;
 * - **la racine est intouchable**, sauf pour être mise hors service.
 *
 * Ce qu'il ne peut pas voir, et qui reste au handler : qu'aucun AUTRE contexte
 * ne porte cette clé ou ce suffixe, et que rien ne le vend au moment de
 * l'effacer.
 */
export class SalesContextAggregate {
  private constructor(
    private readonly identity: string,
    private readonly keyValue: string,
    private readonly perLocationValue: boolean,
    private labelValue: string,
    private handleSuffixValue: string,
    private activeValue: boolean,
    private shopifyProjectedValue: boolean,
    private positionValue: number,
  ) {}

  static open(input: NewSalesContextInput): SalesContextAggregate {
    return new SalesContextAggregate(
      input.id,
      requireKey(input.key),
      input.perLocation,
      requireLabel(input.label),
      input.handleSuffix.trim(),
      input.active,
      input.shopifyProjected,
      input.position,
    );
  }

  static reconstitute(snapshot: SalesContext): SalesContextAggregate {
    return new SalesContextAggregate(
      snapshot.id,
      snapshot.key,
      snapshot.perLocation,
      snapshot.label,
      snapshot.handleSuffix,
      snapshot.active,
      snapshot.shopifyProjected,
      snapshot.position,
    );
  }

  get key(): string {
    return this.keyValue;
  }

  get isRoot(): boolean {
    return isRootContext(this.keyValue);
  }

  get shopifyProjected(): boolean {
    return this.shopifyProjectedValue;
  }

  get handleSuffix(): string {
    return this.handleSuffixValue;
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
    this.handleSuffixValue = revision.handleSuffix.trim();
    this.activeValue = revision.active;
    this.shopifyProjectedValue = revision.shopifyProjected;
    this.positionValue = revision.position;
  }

  /** Refuse un changement de portée — le handler l'appelle avant de réviser. */
  refuseScopeChange(wanted: boolean): void {
    if (wanted !== this.perLocationValue) {
      throw new SalesContextScopeFrozenError(this.keyValue);
    }
  }

  /** Refuse d'effacer la racine. Le reste dépend de ce qui la vend. */
  refuseRemovalIfRoot(): void {
    if (this.isRoot) {
      throw new RootSalesContextProtectedError("être supprimé");
    }
  }

  snapshot(): SalesContext {
    return {
      id: this.identity,
      key: this.keyValue,
      label: this.labelValue,
      handleSuffix: this.handleSuffixValue,
      perLocation: this.perLocationValue,
      active: this.activeValue,
      shopifyProjected: this.shopifyProjectedValue,
      position: this.positionValue,
    };
  }
}

/**
 * La clé est citée par `location_context`, `category_channel` et
 * `product_channel`, et les taux voyagent par elle. Une forme stricte évite
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

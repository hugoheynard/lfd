import {
  BinInnerExceedsOuterError,
  BinTypeAlreadyArchivedError,
  BinTypeArchivedForCapacityError,
  BinTypeNotArchivedError,
  InvalidBinMaxStackError,
  InvalidBinTypeNameError,
} from "../errors/delivery-bin-errors.js";
import {
  BinTypeDimensions,
  type BinTypeDimensionsInput,
  centimetresLabel,
} from "../value-objects/bin-type-dimensions.js";

/** Le nom tient sur une étiquette de grille : la borne du contrat, reprise ici. */
export const BIN_TYPE_NAME_MAX_LENGTH = 60;
/** Bornes d'une pile (L4b-C1). */
export const BIN_MAX_STACK_MIN = 1;
export const BIN_MAX_STACK_MAX = 20;

/** Ce qu'une création ou une correction dit d'un type de bac — la fiche COMPLÈTE. */
export interface BinTypeSpec {
  readonly name: string;
  /** En millimètres entiers. */
  readonly outer: BinTypeDimensionsInput;
  readonly inner: BinTypeDimensionsInput;
  readonly isotherm: boolean;
  readonly maxStack: number;
  readonly divisible: boolean;
}

/** L'état persisté d'un type de bac — ce que `toDomain` réhydrate. */
export interface BinTypeState extends BinTypeSpec {
  readonly id: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

/** La fiche validée. */
interface ValidSpec {
  readonly name: string;
  readonly outer: BinTypeDimensions;
  readonly inner: BinTypeDimensions;
  readonly isotherm: boolean;
  readonly maxStack: number;
  readonly divisible: boolean;
}

/**
 * **Un type de bac** (lot 4 bis, L4b-C1, v2-1) — un réglage de la livraison
 * qui porte un invariant : l'intérieur tient dans l'extérieur.
 *
 * Jamais supprimé : **archivé**, il n'est plus proposé, et reste lisible sur
 * ce qui le cite (v2-7). L'unicité du nom parmi les types non archivés
 * concerne le catalogue entier : c'est la base qui la tient (index partiel),
 * et le handler la lit avant d'écrire pour nommer le refus.
 */
export class BinType {
  private constructor(
    readonly id: string,
    private spec: ValidSpec,
    readonly createdAt: Date,
    private currentUpdatedAt: Date,
    private currentArchivedAt: Date | null,
  ) {}

  /**
   * Un type entre au catalogue, en service.
   * @throws {InvalidBinTypeNameError} @throws {InvalidBinDimensionsError}
   * @throws {BinInnerExceedsOuterError} @throws {InvalidBinMaxStackError}
   */
  static declare(input: BinTypeSpec & { readonly id: string; readonly at: Date }): BinType {
    return new BinType(input.id, validSpecOf(input), input.at, input.at, null);
  }

  /** Réhydrate un type lu en base ; la fiche se revalide. */
  static restore(state: BinTypeState): BinType {
    return new BinType(
      state.id,
      validSpecOf(state),
      state.createdAt,
      state.updatedAt,
      state.archivedAt,
    );
  }

  get name(): string {
    return this.spec.name;
  }

  get outer(): BinTypeDimensions {
    return this.spec.outer;
  }

  get inner(): BinTypeDimensions {
    return this.spec.inner;
  }

  get isotherm(): boolean {
    return this.spec.isotherm;
  }

  get maxStack(): number {
    return this.spec.maxStack;
  }

  get divisible(): boolean {
    return this.spec.divisible;
  }

  get archivedAt(): Date | null {
    return this.currentArchivedAt;
  }

  get updatedAt(): Date {
    return this.currentUpdatedAt;
  }

  get inService(): boolean {
    return this.currentArchivedAt === null;
  }

  /** La fiche telle qu'une correction la décrit — l'« avant » du journal. */
  get specification(): BinTypeSpec {
    return {
      name: this.spec.name,
      outer: this.spec.outer.toInput(),
      inner: this.spec.inner.toInput(),
      isotherm: this.spec.isotherm,
      maxStack: this.spec.maxStack,
      divisible: this.spec.divisible,
    };
  }

  /**
   * Corrige la fiche ENTIÈRE. Permis sur un type archivé : corriger une faute
   * ne le remet pas en service. Tout est validé avant la moindre affectation.
   */
  correct(spec: BinTypeSpec, at: Date): void {
    this.spec = validSpecOf(spec);
    this.currentUpdatedAt = at;
  }

  /** @throws {BinTypeAlreadyArchivedError} il l'est déjà — sa date ne se réécrit pas. */
  archive(at: Date): void {
    if (this.currentArchivedAt !== null) {
      throw new BinTypeAlreadyArchivedError(this.spec.name);
    }
    this.currentArchivedAt = at;
    this.currentUpdatedAt = at;
  }

  /** @throws {BinTypeNotArchivedError} il est déjà en service. */
  reactivate(at: Date): void {
    if (this.currentArchivedAt === null) {
      throw new BinTypeNotArchivedError(this.spec.name);
    }
    this.currentArchivedAt = null;
    this.currentUpdatedAt = at;
  }

  /**
   * Une contenance ne se POSE que sur un type en service : un type archivé
   * n'est plus proposé, sa grille non plus. La retirer reste permis — c'est
   * rendre la grille plus vraie, jamais plus fausse.
   *
   * @throws {BinTypeArchivedForCapacityError}
   */
  ensureAcceptsCapacity(): void {
    if (this.currentArchivedAt !== null) {
      throw new BinTypeArchivedForCapacityError(this.spec.name);
    }
  }

  toState(): BinTypeState {
    return {
      id: this.id,
      ...this.specification,
      createdAt: this.createdAt,
      updatedAt: this.currentUpdatedAt,
      archivedAt: this.currentArchivedAt,
    };
  }
}

/**
 * @throws {InvalidBinTypeNameError} @throws {InvalidBinDimensionsError}
 * @throws {BinInnerExceedsOuterError} @throws {InvalidBinMaxStackError}
 */
function validSpecOf(input: BinTypeSpec): ValidSpec {
  const name = input.name.trim();
  if (name.length === 0 || name.length > BIN_TYPE_NAME_MAX_LENGTH) {
    throw new InvalidBinTypeNameError(BIN_TYPE_NAME_MAX_LENGTH);
  }
  const outer = BinTypeDimensions.of("extérieures", input.outer);
  const inner = BinTypeDimensions.of("intérieures", input.inner);
  ensureInnerFits(sidesOfMm(inner), sidesOfMm(outer), centimetresLabel);
  return {
    name,
    outer,
    inner,
    isotherm: input.isotherm,
    maxStack: ensureMaxStack(input.maxStack),
    divisible: input.divisible,
  };
}

/**
 * @throws {InvalidBinMaxStackError} une pile non entière ou hors 1–20.
 * Exportée pour le format de l'assistant d'achat : la règle n'a qu'un endroit.
 */
export function ensureMaxStack(value: number): number {
  if (!Number.isInteger(value) || value < BIN_MAX_STACK_MIN || value > BIN_MAX_STACK_MAX) {
    throw new InvalidBinMaxStackError(value, BIN_MAX_STACK_MIN, BIN_MAX_STACK_MAX);
  }
  return value;
}

/** Trois côtés, dans l'unité de qui les compare. */
export interface BoxSides {
  readonly length: number;
  readonly width: number;
  readonly height: number;
}

function sidesOfMm(dimensions: BinTypeDimensions): BoxSides {
  return { length: dimensions.lengthMm, width: dimensions.widthMm, height: dimensions.heightMm };
}

/**
 * @param label écrit une mesure avec son unité, pour le refus.
 * @throws {BinInnerExceedsOuterError} la première dimension qui déborde.
 * Exportée pour le format de l'assistant d'achat (G-D3) : la règle n'a qu'un
 * endroit, quelle que soit l'unité.
 */
export function ensureInnerFits(
  inner: BoxSides,
  outer: BoxSides,
  label: (value: number) => string,
): void {
  const pairs: readonly (readonly [string, number, number])[] = [
    ["La longueur", inner.length, outer.length],
    ["La largeur", inner.width, outer.width],
    ["La hauteur", inner.height, outer.height],
  ];
  for (const [name, innerSide, outerSide] of pairs) {
    if (innerSide > outerSide) {
      throw new BinInnerExceedsOuterError(name, label(innerSide), label(outerSide));
    }
  }
}

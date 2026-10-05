import {
  InvalidContainerQuantityError,
  OverAllocationError,
  PackingContainerNotFoundError,
  PackingContainerVoidedError,
  WithdrawBeyondContentError,
} from "../errors/packing-container-errors.js";

/** La ligne due, vue des contenants : l'article, son nom, sa quantité. */
export interface DueLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** `bin` : un bac de livraison, déclaré par la livraison. `bag` : un sac, né ici. */
export type ContainerNature = "bin" | "bag";

/** Le bac d'un contenant `bin` — l'identifiant OPAQUE et l'instantané de l'étiquette. */
export interface ContainerBin {
  readonly binId: string;
  readonly code: string;
  /** `null` = un bac entier. */
  readonly half: "left" | "right" | null;
}

/** Une signature : l'instant et la fiche staff. */
export interface ContainerMark {
  readonly at: Date;
  readonly by: string;
}

/** Ce qu'un contenant porte d'un article. Une quantité à zéro reste une ligne. */
export interface ContainerLine {
  readonly sku: string;
  readonly quantity: number;
}

/** Un contenant, tel que l'adaptateur l'écrit et le relit. */
export interface PackingContainerState {
  readonly id: string;
  readonly nature: ContainerNature;
  /** Non nul si et seulement si `nature = 'bin'`. */
  readonly bin: ContainerBin | null;
  readonly opened: ContainerMark;
  /** `null` = vivant. */
  readonly voided: ContainerMark | null;
  readonly lines: readonly ContainerLine[];
}

/** Une quantité de pièces : un entier, au moins une. @throws {InvalidContainerQuantityError} */
export function piecesToMove(quantity: number): number {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new InvalidContainerQuantityError(quantity);
  }
  return quantity;
}

/**
 * **Les contenants d'une commande et leur contenu** (K2b,
 * `colisage/plan-les-bacs-au-colisage.md` §5–§5.1) — la partie de l'agrégat
 * `PackingSheet` qui tient la colonne Contenants.
 *
 * Elle ne sait que des sommes : ce qu'un contenant porte, ce que les
 * contenants VIVANTS portent d'un article. La règle qui borne une répartition
 * à la quantité due, et celle qui dit qu'une ligne est au bac, sont celles du
 * bac (`PackingSheet`), qui connaît ses lignes. Un contenant annulé garde ses
 * lignes — jamais de suppression —, et ne compte plus.
 */
export class OrderContents {
  private constructor(
    private readonly reference: string,
    private containersValue: readonly PackingContainerState[],
  ) {}

  static of(reference: string, containers: readonly PackingContainerState[]): OrderContents {
    return new OrderContents(reference, containers);
  }

  get containers(): readonly PackingContainerState[] {
    return this.containersValue;
  }

  get liveCount(): number {
    return this.containersValue.filter((container) => container.voided === null).length;
  }

  /** Les bacs de livraison des contenants vivants. */
  get liveBinIds(): readonly string[] {
    return this.containersValue.flatMap((container) =>
      container.voided === null && container.bin !== null ? [container.bin.binId] : [],
    );
  }

  /** Ce que les contenants vivants portent de cet article. */
  allocatedOf(sku: string): number {
    return this.containersValue
      .filter((container) => container.voided === null)
      .reduce((sum, container) => sum + heldIn(container, sku), 0);
  }

  /**
   * Le contenant vivant sous cet identifiant.
   *
   * @throws {PackingContainerNotFoundError} @throws {PackingContainerVoidedError}
   */
  live(containerId: string): PackingContainerState {
    const container = this.containersValue.find((candidate) => candidate.id === containerId);
    if (container === undefined) {
      throw new PackingContainerNotFoundError(this.reference);
    }
    if (container.voided !== null) {
      throw new PackingContainerVoidedError(this.reference);
    }
    return container;
  }

  add(container: PackingContainerState): void {
    this.containersValue = [...this.containersValue, container];
  }

  /**
   * Répartit des pièces d'une ligne dans un contenant vivant, au plus ce qui
   * reste de la ligne.
   *
   * @returns les pièces réparties.
   * @throws {InvalidContainerQuantityError} @throws {OverAllocationError}
   */
  allocate(containerId: string, line: DueLine, quantity: number): number {
    const pieces = piecesToMove(quantity);
    this.live(containerId);
    const remaining = line.quantity - this.allocatedOf(line.sku);
    if (pieces > remaining) {
      throw new OverAllocationError(line.productName, Math.max(0, remaining));
    }
    this.shift(containerId, line.sku, pieces);
    return pieces;
  }

  /**
   * Retire des pièces d'une ligne d'un contenant vivant, au plus ce qu'il porte.
   *
   * @returns les pièces retirées.
   * @throws {InvalidContainerQuantityError} @throws {WithdrawBeyondContentError}
   */
  withdraw(containerId: string, line: DueLine, quantity: number): number {
    const pieces = piecesToMove(quantity);
    const held = heldIn(this.live(containerId), line.sku);
    if (pieces > held) {
      throw new WithdrawBeyondContentError(line.productName, held);
    }
    this.shift(containerId, line.sku, -pieces);
    return pieces;
  }

  /** Les lignes dont une quantité n'est pas répartie. */
  unallocated(lines: readonly DueLine[]): readonly DueLine[] {
    return lines.filter((line) => this.allocatedOf(line.sku) < line.quantity);
  }

  /** Change ce que porte un contenant vivant de cet article, d'un écart signé. */
  private shift(containerId: string, sku: string, delta: number): void {
    const container = this.live(containerId);
    const held = heldIn(container, sku);
    const lines = container.lines.some((line) => line.sku === sku)
      ? container.lines.map((line) => (line.sku === sku ? { sku, quantity: held + delta } : line))
      : [...container.lines, { sku, quantity: held + delta }];
    this.replace({ ...container, lines });
  }

  /**
   * Annule un contenant vivant.
   *
   * @returns ce qu'il portait, article par article (quantités non nulles) —
   *   ce qui retourne à la réserve.
   */
  void(containerId: string, mark: ContainerMark): readonly ContainerLine[] {
    const container = this.live(containerId);
    this.replace({ ...container, voided: mark });
    return container.lines.filter((line) => line.quantity > 0);
  }

  private replace(next: PackingContainerState): void {
    this.containersValue = this.containersValue.map((container) =>
      container.id === next.id ? next : container,
    );
  }
}

function heldIn(container: PackingContainerState, sku: string): number {
  return container.lines.find((line) => line.sku === sku)?.quantity ?? 0;
}

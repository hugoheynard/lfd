import {
  ContainerCeilingReachedError,
  InvalidContainerCountError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
} from "../errors/packing-station-errors.js";

/**
 * Le plafond d'une commande : **99 containers** — le même nombre que l'ancien
 * poste (`production/domain/value-objects/container-step.ts`) et que
 * `setPackingContainersSchema` côté contrat. Recopié et non importé : le
 * colisage n'atteint le fournil que par son canal, et ce nombre est désormais
 * une règle du colisage (§11 MINEURS). Les trois bougent ensemble.
 */
export const MAX_CONTAINERS_PER_ORDER = 99;

/** Une signature : l'instant et la fiche staff. */
export interface SheetMark {
  readonly at: Date;
  readonly by: string;
}

/** La ligne au bac — avec les initiales, vides permises. */
export interface SheetLineMark extends SheetMark {
  readonly initials: string;
}

/** Une ligne à coliser : l'article, la quantité due, et si elle est au bac. */
export interface SheetLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly packed: SheetLineMark | null;
}

/** L'état d'un bac, tel que l'adaptateur l'écrit et le relit. */
export interface PackingSheetSnapshot {
  readonly serviceDay: string;
  readonly orderId: string;
  readonly reference: string;
  readonly packed: SheetMark | null;
  readonly containers: number;
  readonly lines: readonly SheetLine[];
}

/** Un pas de container — le type du canal, structurellement. */
export type ContainerStep = "add" | "remove";

/**
 * **Le bac d'une commande** — l'agrégat du poste de colisage (plan
 * `documentation/colisage/plan-domaine-colisage.md`, K2, §12.2).
 *
 * Les règles de l'ancien poste y déménagent, telles quelles : une ligne est
 * réversible tant que le bac est ouvert ; un bac fermé ne bouge plus — ni
 * ligne, ni compte de containers — parce que le commerce a annoncé « prête » ;
 * le compte de containers est borné.
 *
 * Ce qu'il ne décide PAS : si la marchandise existe. C'est la réserve
 * (`PackingStock`) qui le dit ; le service du poste les fait parler ensemble,
 * sous verrou.
 */
export class PackingSheet {
  private constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly reference: string,
    private packedValue: SheetMark | null,
    private containersValue: number,
    private linesValue: readonly SheetLine[],
  ) {}

  static fromSnapshot(snapshot: PackingSheetSnapshot): PackingSheet {
    return new PackingSheet(
      snapshot.serviceDay,
      snapshot.orderId,
      snapshot.reference,
      snapshot.packed,
      snapshot.containers,
      snapshot.lines,
    );
  }

  get packed(): SheetMark | null {
    return this.packedValue;
  }

  get containers(): number {
    return this.containersValue;
  }

  get lines(): readonly SheetLine[] {
    return this.linesValue;
  }

  /**
   * La ligne qu'on s'apprête à mettre au bac ou à en ressortir — sans muter.
   *
   * @throws {PackedOrderSealedError} le bac est fermé.
   * @throws {PackingLineNotFoundError} ce SKU n'est pas sur ce bon.
   */
  lineToTouch(sku: string): SheetLine {
    this.assertOpen();
    const line = this.linesValue.find((candidate) => candidate.sku === sku);
    if (line === undefined) {
      throw new PackingLineNotFoundError(sku, this.reference);
    }
    return line;
  }

  /**
   * La ligne entre au bac. Recocher réécrit la signature — le dernier geste
   * est le vrai — sans prendre de pièce de plus.
   *
   * @returns les pièces que ce geste PREND à la réserve (0 sur un recocher).
   */
  put(sku: string, mark: SheetLineMark): number {
    const line = this.lineToTouch(sku);
    this.replaceLine({ ...line, packed: mark });
    return line.packed === null ? line.quantity : 0;
  }

  /** @returns les pièces que ce geste REND à la réserve (0 si elle n'y était pas). */
  takeOut(sku: string): number {
    const line = this.lineToTouch(sku);
    this.replaceLine({ ...line, packed: null });
    return line.packed === null ? 0 : line.quantity;
  }

  /**
   * Le bac est fermé — le fait irréversible du colisage.
   *
   * « Déjà fait » n'est pas un refus : c'est une réannonce (le rescan répare un
   * abonné perdu), décidée par l'appelant. La signature rendue est alors celle
   * d'ORIGINE, jamais celle du rescan.
   */
  seal(mark: SheetMark): { readonly mark: SheetMark; readonly fresh: boolean } {
    if (this.packedValue !== null) {
      return { mark: this.packedValue, fresh: false };
    }
    this.packedValue = mark;
    return { mark, fresh: true };
  }

  /**
   * Un container de plus ou de moins. Un retrait à zéro est sans effet.
   *
   * @throws {PackedOrderSealedError} le bac est fermé.
   * @throws {ContainerCeilingReachedError} un ajout au plafond.
   */
  step(step: ContainerStep): void {
    this.assertOpen();
    if (step === "add") {
      if (this.containersValue >= MAX_CONTAINERS_PER_ORDER) {
        throw new ContainerCeilingReachedError(this.reference, MAX_CONTAINERS_PER_ORDER);
      }
      this.containersValue += 1;
      return;
    }
    this.containersValue = Math.max(0, this.containersValue - 1);
  }

  /**
   * Le TOTAL de containers (route dépréciée, encore servie).
   *
   * @throws {PackedOrderSealedError} le bac est fermé.
   * @throws {InvalidContainerCountError} ce n'est pas un nombre de bacs.
   */
  declareContainers(containers: number): void {
    this.assertOpen();
    if (!Number.isInteger(containers) || containers < 0 || containers > MAX_CONTAINERS_PER_ORDER) {
      throw new InvalidContainerCountError(containers);
    }
    this.containersValue = containers;
  }

  toSnapshot(): PackingSheetSnapshot {
    return {
      serviceDay: this.serviceDay,
      orderId: this.orderId,
      reference: this.reference,
      packed: this.packedValue,
      containers: this.containersValue,
      lines: this.linesValue,
    };
  }

  private assertOpen(): void {
    if (this.packedValue !== null) {
      throw new PackedOrderSealedError(this.reference);
    }
  }

  private replaceLine(next: SheetLine): void {
    this.linesValue = this.linesValue.map((line) => (line.sku === next.sku ? next : line));
  }
}

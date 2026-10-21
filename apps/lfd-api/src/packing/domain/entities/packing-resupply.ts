import {
  PackedResupplyQuantityOutOfRangeError,
  PackingResupplyClosedError,
  PackingResupplyIncompleteError,
  PackingResupplyLineNotFoundError,
} from "../errors/packing-resupply-errors.js";

/** Un geste daté et signé (identifiant staff). */
export interface ResupplyMark {
  readonly at: Date;
  readonly by: string;
}

/** Une ligne de la fiche : demandé, et emballé une fois saisi. */
export interface PackingResupplyLineSnapshot {
  readonly sku: string;
  readonly productName: string;
  /** La quantité demandée par le point, figée à l'arrêt. */
  readonly quantity: number;
  /** La quantité réellement emballée et sa saisie ; `null` : pas encore saisie. */
  readonly packed: (ResupplyMark & { readonly quantity: number }) | null;
}

/** L'état d'une fiche, tel que l'adaptateur l'écrit et le relit. */
export interface PackingResupplySnapshot {
  readonly serviceDay: string;
  readonly resupplyId: string;
  readonly siteId: string;
  readonly siteLabel: string | null;
  readonly drawnAt: Date;
  readonly closed: ResupplyMark | null;
  readonly lines: readonly PackingResupplyLineSnapshot[];
}

/** Ce qu'une saisie change à la réserve : `delta` > 0 prend, < 0 rend. */
export interface PackedChange {
  readonly sku: string;
  readonly productName: string;
  readonly delta: number;
}

/**
 * **La fiche de réassort au colisage** (réassort, lot R3b, 2026-10-21 —
 * `reassort-boutiques/plan-reapprovisionnement.md` §13.1 point 5, §13.3).
 *
 * À part de `PackingSheet` : un réassort n'a ni client, ni bon, ni bac
 * déclaré. Le poste saisit la quantité RÉELLEMENT emballée de chaque ligne —
 * 0 permis, jamais plus que demandé —, puis clôt la fiche : l'emballé devient
 * lisible par le commerce, qui pré-remplit sa réception.
 *
 * Invariants : une fiche close ne bouge plus ; on ne la clôt pas avec une
 * ligne non saisie (un oubli ne doit pas valoir « 0 parti »). Une fiche
 * ENTAMÉE — une ligne saisie — empêche la réouverture du plan du fournil.
 */
export class PackingResupply {
  private constructor(
    readonly serviceDay: string,
    readonly resupplyId: string,
    readonly siteId: string,
    readonly siteLabel: string | null,
    readonly drawnAt: Date,
    private closedValue: ResupplyMark | null,
    private linesValue: readonly PackingResupplyLineSnapshot[],
  ) {}

  static fromSnapshot(snapshot: PackingResupplySnapshot): PackingResupply {
    return new PackingResupply(
      snapshot.serviceDay,
      snapshot.resupplyId,
      snapshot.siteId,
      snapshot.siteLabel,
      snapshot.drawnAt,
      snapshot.closed,
      snapshot.lines,
    );
  }

  /** « Réassort <point> » — le nom du point, ou son identifiant s'il est inconnu. */
  get title(): string {
    return titleOf(this.siteLabel, this.siteId);
  }

  get closed(): ResupplyMark | null {
    return this.closedValue;
  }

  get lines(): readonly PackingResupplyLineSnapshot[] {
    return this.linesValue;
  }

  /** Entamée : une ligne saisie, ou la fiche close. */
  get started(): boolean {
    return this.closedValue !== null || this.linesValue.some((line) => line.packed !== null);
  }

  /**
   * Saisit la quantité réellement emballée d'une ligne, et rend ce que la
   * réserve du jour doit prendre (ou reprendre) pour elle.
   *
   * @throws {PackingResupplyClosedError} @throws {PackingResupplyLineNotFoundError}
   * @throws {PackedResupplyQuantityOutOfRangeError}
   */
  enterPacked(sku: string, quantity: number, mark: ResupplyMark): PackedChange {
    this.assertOpen();
    const line = this.linesValue.find((candidate) => candidate.sku === sku);
    if (line === undefined) {
      throw new PackingResupplyLineNotFoundError(sku, this.title);
    }
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > line.quantity) {
      throw new PackedResupplyQuantityOutOfRangeError(line.productName, line.quantity);
    }
    const before = line.packed?.quantity ?? 0;
    this.linesValue = this.linesValue.map((candidate) =>
      candidate === line ? { ...line, packed: { ...mark, quantity } } : candidate,
    );
    return { sku, productName: line.productName, delta: quantity - before };
  }

  /**
   * Clôt la fiche. Une fiche déjà close reste telle quelle (`false`) : un
   * second clic ne réécrit ni l'instant ni l'auteur.
   *
   * @returns `true` si la clôture est neuve.
   * @throws {PackingResupplyIncompleteError} une ligne n'est pas saisie.
   */
  close(mark: ResupplyMark): boolean {
    if (this.closedValue !== null) {
      return false;
    }
    const missing = this.linesValue.filter((line) => line.packed === null);
    if (missing.length > 0) {
      throw new PackingResupplyIncompleteError(
        this.title,
        missing.map((line) => line.productName),
      );
    }
    this.closedValue = mark;
    return true;
  }

  toSnapshot(): PackingResupplySnapshot {
    return {
      serviceDay: this.serviceDay,
      resupplyId: this.resupplyId,
      siteId: this.siteId,
      siteLabel: this.siteLabel,
      drawnAt: this.drawnAt,
      closed: this.closedValue,
      lines: this.linesValue,
    };
  }

  private assertOpen(): void {
    if (this.closedValue !== null) {
      throw new PackingResupplyClosedError(this.title);
    }
  }
}

/** « Réassort <point> » — partagé avec la lecture du poste. */
export function titleOf(siteLabel: string | null, siteId: string): string {
  return `Réassort ${siteLabel ?? siteId}`;
}

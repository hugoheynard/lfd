import {
  BackorderClosedError,
  BackorderConvertedIntoOriginError,
  DuplicateBackorderLineError,
  EmptyBackorderError,
} from "../errors/backorder-errors.js";
import type { BackorderLine } from "../value-objects/backorder-line.js";

/** Le sort d'un reliquat : ouvert, puis transformé ou abandonné, définitivement. */
export type BackorderState = "open" | "converted" | "abandoned";

/** L'état tel que l'adaptateur l'écrit et le relit. */
export interface BackorderSnapshot {
  readonly id: string;
  readonly originOrderId: string;
  /** La société de l'origine ; `null` pour un particulier. */
  readonly companyId: string | null;
  readonly buyerUserId: string;
  readonly lines: readonly BackorderLine[];
  readonly state: BackorderState;
  /** La commande issue du reliquat, non nulle SSI `converted`. */
  readonly convertedOrderId: string | null;
  /** Qui l'a fermé, et quand — non nuls SSI l'état n'est pas `open`. */
  readonly closedAt: Date | null;
  readonly closedByStaffId: string | null;
  /** L'instant de la décision du départ qui l'a fait naître. */
  readonly createdAt: Date;
}

/** Ce que la naissance d'un reliquat reçoit de la décision du départ. */
export interface BackorderOpening {
  readonly id: string;
  readonly originOrderId: string;
  readonly companyId: string | null;
  readonly buyerUserId: string;
  readonly lines: readonly BackorderLine[];
  readonly openedAt: Date;
}

/**
 * **Le reliquat de commande** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`, § 2) : ce
 * qui n'est pas parti d'une commande incomplète. Ce n'est pas une commande :
 * il attend que l'équipe le transforme en commande ordinaire ou l'abandonne,
 * et l'un comme l'autre est définitif (décision 2).
 *
 * Il porte trois invariants : il n'existe pas sans au moins une ligne, une
 * ligne par article ; il ne se ferme qu'une fois ; la commande qui en est
 * issue n'est pas son origine. La base les retient aussi (CHECK de
 * `backorder`), pour une écriture qui contournerait l'agrégat.
 */
export class Backorder {
  private constructor(private state: BackorderSnapshot) {}

  /**
   * @throws {EmptyBackorderError} aucune ligne.
   * @throws {DuplicateBackorderLineError} deux lignes du même article.
   */
  static open(opening: BackorderOpening): Backorder {
    Backorder.assertLines(opening.lines);
    return new Backorder({
      id: opening.id,
      originOrderId: opening.originOrderId,
      companyId: opening.companyId,
      buyerUserId: opening.buyerUserId,
      lines: [...opening.lines],
      state: "open",
      convertedOrderId: null,
      closedAt: null,
      closedByStaffId: null,
      createdAt: opening.openedAt,
    });
  }

  /** Relit un reliquat écrit ; les lignes reviennent revalidées par leur value object. */
  static restore(snapshot: BackorderSnapshot): Backorder {
    Backorder.assertLines(snapshot.lines);
    return new Backorder({ ...snapshot, lines: [...snapshot.lines] });
  }

  /**
   * Le reliquat devient la commande `orderId`, passée par l'équipe.
   *
   * @throws {BackorderClosedError} déjà transformé ou abandonné.
   * @throws {BackorderConvertedIntoOriginError} `orderId` est la commande d'origine.
   */
  convert(orderId: string, at: Date, by: string): void {
    this.assertOpen();
    if (orderId === this.state.originOrderId) {
      throw new BackorderConvertedIntoOriginError();
    }
    this.state = {
      ...this.state,
      state: "converted",
      convertedOrderId: orderId,
      closedAt: at,
      closedByStaffId: by,
    };
  }

  /**
   * Le client ne veut pas du reste.
   *
   * @throws {BackorderClosedError} déjà transformé ou abandonné.
   */
  abandon(at: Date, by: string): void {
    this.assertOpen();
    this.state = { ...this.state, state: "abandoned", closedAt: at, closedByStaffId: by };
  }

  get id(): string {
    return this.state.id;
  }

  get originOrderId(): string {
    return this.state.originOrderId;
  }

  get isOpen(): boolean {
    return this.state.state === "open";
  }

  toSnapshot(): BackorderSnapshot {
    return { ...this.state, lines: [...this.state.lines] };
  }

  private assertOpen(): void {
    if (this.state.state !== "open") {
      throw new BackorderClosedError(this.state.state);
    }
  }

  private static assertLines(lines: readonly BackorderLine[]): void {
    if (lines.length === 0) {
      throw new EmptyBackorderError();
    }
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.sku)) {
        throw new DuplicateBackorderLineError(line.sku);
      }
      seen.add(line.sku);
    }
  }
}

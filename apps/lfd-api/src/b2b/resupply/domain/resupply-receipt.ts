import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  InvalidServiceDayError,
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
} from "./resupply-receipt-errors.js";
import { ResupplyReceiptLine } from "./resupply-receipt-line.js";

const SERVICE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** La trace du dernier geste sur la liste. */
export interface ResupplyReceiptTrace {
  readonly at: Date;
  readonly author: StaffTrace;
}

/** L'état persisté, tel que l'adaptateur le relit. */
export interface ResupplyReceiptSnapshot {
  readonly id: string;
  readonly siteId: string;
  readonly serviceDay: string;
  readonly version: number;
  readonly lines: readonly {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }[];
  readonly lastChange: ResupplyReceiptTrace | null;
}

/**
 * **La réception du réapprovisionnement d'un site, pour une journée** — ce que
 * la vitrine a reçu (plan `limites-de-commande/plan-jour-meme-sur-stock.md`,
 * J1 ; modèle B de `livraisons/transferts/plan-reapprovisionnement.md`, décidé
 * par Hugo le 2026-10-21).
 *
 * C'est la partie « reçue » du futur `SiteResupply` (la demande au fournil,
 * non bâtie) : deux agrégats, parce que demander et recevoir ont deux
 * auteurs et deux moments — ce qui arrive n'est pas toujours ce qui a été
 * demandé, et le comptoir corrige ce qu'il voit. Le jour où la demande
 * existera, elle PRÉ-REMPLIRA cette réception (Q4 du plan du jour même).
 *
 * Ce que l'agrégat garantit : un article au plus une fois (un doublon est
 * refusé, cf. `ReceiptLineAlreadyPresentError`), des quantités entières ≥ 0,
 * et un auteur sur chaque geste. Il ne connaît ni prix, ni commande : le stock
 * estimé se calcule à la lecture (`estimateStock`).
 */
export class ResupplyReceipt {
  private constructor(
    readonly id: string,
    readonly siteId: string,
    readonly serviceDay: string,
    readonly version: number,
    private lineList: readonly ResupplyReceiptLine[],
    private trace: ResupplyReceiptTrace | null,
  ) {}

  /** Une réception vide, ouverte au premier geste du jour sur ce site. */
  static open(input: {
    readonly id: string;
    readonly siteId: string;
    readonly serviceDay: string;
  }): ResupplyReceipt {
    if (!SERVICE_DAY.test(input.serviceDay)) {
      throw new InvalidServiceDayError(input.serviceDay);
    }
    return new ResupplyReceipt(input.id, input.siteId, input.serviceDay, 0, [], null);
  }

  /** Réhydrate depuis la base ; chaque ligne revalide. */
  static restore(snapshot: ResupplyReceiptSnapshot): ResupplyReceipt {
    return new ResupplyReceipt(
      snapshot.id,
      snapshot.siteId,
      snapshot.serviceDay,
      snapshot.version,
      snapshot.lines.map((line) => ResupplyReceiptLine.of(line)),
      snapshot.lastChange,
    );
  }

  get lines(): readonly ResupplyReceiptLine[] {
    return this.lineList;
  }

  get lastChange(): ResupplyReceiptTrace | null {
    return this.trace;
  }

  /** Ajoute un article reçu, à la fin de la liste. Refusé s'il y est déjà. */
  receive(line: ResupplyReceiptLine, trace: ResupplyReceiptTrace): void {
    if (this.lineList.some((existing) => existing.sku === line.sku)) {
      throw new ReceiptLineAlreadyPresentError(line.sku);
    }
    this.lineList = [...this.lineList, line];
    this.trace = trace;
  }

  /** Corrige la quantité reçue d'un article de la liste. */
  correct(sku: string, quantity: number, trace: ResupplyReceiptTrace): void {
    const target = this.lineOf(sku);
    this.lineList = this.lineList.map((line) =>
      line === target ? line.withQuantity(quantity) : line,
    );
    this.trace = trace;
  }

  /** Retire un article de la liste (saisi par erreur). */
  withdraw(sku: string, trace: ResupplyReceiptTrace): void {
    const target = this.lineOf(sku);
    this.lineList = this.lineList.filter((line) => line !== target);
    this.trace = trace;
  }

  private lineOf(sku: string): ResupplyReceiptLine {
    const line = this.lineList.find((existing) => existing.sku === sku);
    if (line === undefined) {
      throw new ReceiptLineNotFoundError(sku);
    }
    return line;
  }
}

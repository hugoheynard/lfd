import { instantToLocal } from "@lfd/contracts";

import type { StaffTrace } from "../../account/domain/value-objects/staff-trace.js";
import {
  InvalidServiceDayError,
  ReceiptBoundToResupplyError,
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
  ReceiptNotYetReceivedError,
  ResupplyAlreadyReceivedError,
  ResupplyDayNotYetComeError,
} from "./resupply-receipt-errors.js";
import { ResupplyReceiptLine, type ResupplyReceiptLineSnapshot } from "./resupply-receipt-line.js";

const SERVICE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Un geste daté et signé. */
export interface ResupplyReceiptTrace {
  readonly at: Date;
  readonly author: StaffTrace;
}

/** `expected` : arrivé ou en route, pas encore attesté ; `received` : compte au stock. */
export type ResupplyReceiptStatus = "expected" | "received";

/** L'état persisté, tel que l'adaptateur le relit. */
export interface ResupplyReceiptSnapshot {
  readonly id: string;
  readonly siteId: string;
  readonly serviceDay: string;
  /** Le réassort réceptionné ; `null` pour un réassort sans commande. */
  readonly resupplyId: string | null;
  readonly version: number;
  readonly lines: readonly ResupplyReceiptLineSnapshot[];
  /** Le geste « Réceptionner », ou la première saisie d'un réassort sans commande. */
  readonly received: ResupplyReceiptTrace | null;
  readonly lastChange: ResupplyReceiptTrace | null;
}

/** Ce qu'il faut d'un réassort envoyé pour en attendre la réception. */
export interface ReceivableResupply {
  readonly id: string;
  readonly siteId: string;
  readonly serviceDay: string;
  readonly lines: readonly {
    readonly sku: string;
    readonly label: string;
    readonly quantity: number;
  }[];
}

/**
 * **Un reçu de réassort** — ce que la vitrine d'un point a reçu (lot R2 de
 * `reassort-boutiques/plan-reapprovisionnement.md` §12 ; décisions de Hugo du
 * 2026-10-21 : « personne ne fera du ligne par ligne en plein service », un
 * reçu par réassort, le stock du jour additionne les reçus).
 *
 * Deux sortes, un seul agrégat — parce que la règle qui compte au stock est la
 * même (seul le REÇU compte) et que le stock les additionne sans les
 * distinguer :
 *
 * - **le reçu d'un réassort envoyé** (`resupplyId`) : ses lignes ATTENDUES
 *   sont celles du réassort ; un geste unique, `receiveAll`, recopie l'attendu
 *   en reçu. Une ligne ne se corrige qu'APRÈS ce geste (un écart constaté) ;
 *   on n'y ajoute ni n'en retire d'article. Un second « Réceptionner » est
 *   refusé (409), jamais rejoué en silence ;
 * - **le réassort sans commande** (`resupplyId` nul) : la saisie de secours,
 *   ligne par ligne, un par (point, journée). Chaque ligne y est reçue dès
 *   sa saisie ; un même article deux fois est refusé (corrigez sa quantité).
 */
export class ResupplyReceipt {
  private constructor(
    readonly id: string,
    readonly siteId: string,
    readonly serviceDay: string,
    readonly resupplyId: string | null,
    readonly version: number,
    private lineList: readonly ResupplyReceiptLine[],
    private receivedTrace: ResupplyReceiptTrace | null,
    private trace: ResupplyReceiptTrace | null,
  ) {}

  /**
   * Le reçu attendu d'un réassort envoyé. Son attendu est la quantité
   * EMBALLÉE au colisage quand elle est connue (lot R3b : `packed`, SKU →
   * pièces, d'une fiche close), sinon la quantité demandée.
   */
  static expecting(
    id: string,
    resupply: ReceivableResupply,
    packed: ReadonlyMap<string, number> | null = null,
  ): ResupplyReceipt {
    assertServiceDay(resupply.serviceDay);
    const lines = expectedLinesOf(resupply, packed).map((line) =>
      ResupplyReceiptLine.expected(line),
    );
    return new ResupplyReceipt(
      id,
      resupply.siteId,
      resupply.serviceDay,
      resupply.id,
      0,
      lines,
      null,
      null,
    );
  }

  /** Un réassort sans commande, vide, ouvert à la première saisie du jour au point. */
  static openUnordered(input: {
    readonly id: string;
    readonly siteId: string;
    readonly serviceDay: string;
  }): ResupplyReceipt {
    assertServiceDay(input.serviceDay);
    return new ResupplyReceipt(input.id, input.siteId, input.serviceDay, null, 0, [], null, null);
  }

  /** Réhydrate depuis la base ; chaque ligne revalide. */
  static restore(snapshot: ResupplyReceiptSnapshot): ResupplyReceipt {
    return new ResupplyReceipt(
      snapshot.id,
      snapshot.siteId,
      snapshot.serviceDay,
      snapshot.resupplyId,
      snapshot.version,
      snapshot.lines.map((line) => ResupplyReceiptLine.of(line)),
      snapshot.received,
      snapshot.lastChange,
    );
  }

  get lines(): readonly ResupplyReceiptLine[] {
    return this.lineList;
  }

  get status(): ResupplyReceiptStatus {
    return this.receivedTrace === null ? "expected" : "received";
  }

  get received(): ResupplyReceiptTrace | null {
    return this.receivedTrace;
  }

  get lastChange(): ResupplyReceiptTrace | null {
    return this.trace;
  }

  /**
   * « Réceptionner » : toutes les lignes attendues deviennent reçues, d'un
   * geste. Refusé avant sa journée, à l'heure de Paris (lot R1d) : le stock
   * d'un jour ne compte que ce qui est arrivé ce jour-là.
   */
  receiveAll(trace: ResupplyReceiptTrace): void {
    const already = this.receivedTrace;
    if (already !== null) {
      const at = instantToLocal(already.at);
      throw new ResupplyAlreadyReceivedError(already.author.name, `le ${at.day} à ${at.time}`);
    }
    if (instantToLocal(trace.at).day < this.serviceDay) {
      throw new ResupplyDayNotYetComeError(this.serviceDay);
    }
    this.lineList = this.lineList.map((line) => line.receivedAsExpected());
    this.receivedTrace = trace;
    this.trace = trace;
  }

  /** Réassort sans commande : ajoute un article reçu. Refusé s'il y est déjà. */
  receive(line: ResupplyReceiptLine, trace: ResupplyReceiptTrace): void {
    this.assertUnordered();
    if (this.lineList.some((existing) => existing.sku === line.sku)) {
      throw new ReceiptLineAlreadyPresentError(line.sku);
    }
    this.lineList = [...this.lineList, line];
    this.receivedTrace ??= trace;
    this.trace = trace;
  }

  /** Corrige le reçu d'un article — un écart, après réception seulement. */
  correct(sku: string, quantity: number, trace: ResupplyReceiptTrace): void {
    if (this.receivedTrace === null) {
      throw new ReceiptNotYetReceivedError();
    }
    const target = this.lineOf(sku);
    this.lineList = this.lineList.map((line) =>
      line === target ? line.withReceived(quantity) : line,
    );
    this.trace = trace;
  }

  /** Réassort sans commande : retire un article saisi par erreur. */
  withdraw(sku: string, trace: ResupplyReceiptTrace): void {
    this.assertUnordered();
    const target = this.lineOf(sku);
    this.lineList = this.lineList.filter((line) => line !== target);
    this.trace = trace;
  }

  private assertUnordered(): void {
    if (this.resupplyId !== null) {
      throw new ReceiptBoundToResupplyError();
    }
  }

  private lineOf(sku: string): ResupplyReceiptLine {
    const line = this.lineList.find((existing) => existing.sku === sku);
    if (line === undefined) {
      throw new ReceiptLineNotFoundError(sku);
    }
    return line;
  }
}

function assertServiceDay(serviceDay: string): void {
  if (!SERVICE_DAY.test(serviceDay)) {
    throw new InvalidServiceDayError(serviceDay);
  }
}

/**
 * Les lignes attendues : l'emballé s'il est connu, sinon le demandé (lot
 * R3b, §13.1 point 6). Partagé avec la page de réception, qui montre
 * l'attendu avant « Réceptionner ».
 */
export function expectedLinesOf(
  resupply: Pick<ReceivableResupply, "lines">,
  packed: ReadonlyMap<string, number> | null,
): readonly { readonly sku: string; readonly label: string; readonly quantity: number }[] {
  return resupply.lines.map((line) => ({
    sku: line.sku,
    label: line.label,
    quantity: packed?.get(line.sku) ?? line.quantity,
  }));
}

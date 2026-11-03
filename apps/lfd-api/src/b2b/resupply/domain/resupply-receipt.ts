import { instantToLocal } from "@lfd/contracts";

import {
  InvalidServiceDayError,
  ReceiptBoundToResupplyError,
  ReceiptLineAlreadyPresentError,
  ReceiptLineNotFoundError,
  ReceiptNotBoundToResupplyError,
  ReceiptNotYetReceivedError,
  ResupplyAlreadyReceivedError,
  ResupplyDayNotYetComeError,
  UnorderedReceiptNotTodayError,
} from "./resupply-receipt-errors.js";
import { ResupplyReceiptLine, type ResupplyReceiptLineSnapshot } from "./resupply-receipt-line.js";
import { ResupplyLineUnitMismatchError } from "./resupply-sale-unit-errors.js";
import type { ResupplyTrace } from "./resupply-trace.js";
import {
  expectedLinesOf,
  type PackedLines,
  type ReceivableResupply,
} from "./resupply-receipt-expected.js";

export {
  expectedLinesOf,
  type PackedLines,
  type ReceivableResupply,
} from "./resupply-receipt-expected.js";

const SERVICE_DAY = /^\d{4}-\d{2}-\d{2}$/;

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
  readonly received: ResupplyTrace | null;
  readonly lastChange: ResupplyTrace | null;
}

/**
 * **Un reçu de réassort** — ce que la vitrine d'un point a reçu (R2 de
 * `reassort-boutiques/README.md` ; décisions de Hugo du
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
    /**
     * La version LUE en base (`0` : pas encore écrite), qui n'avance pas en mémoire : l'adaptateur
     * écrit `version + 1`, et un agrégat ne se sauve qu'une fois par unité de travail (2026-11-02).
     */
    readonly version: number,
    private lineList: readonly ResupplyReceiptLine[],
    private receivedTrace: ResupplyTrace | null,
    private trace: ResupplyTrace | null,
  ) {}

  /**
   * Le reçu attendu d'un réassort envoyé. Son attendu est la quantité
   * EMBALLÉE au colisage quand elle est connue (R3b : `packed`, SKU →
   * quantité et unité, d'une fiche close), sinon la quantité demandée.
   */
  static expecting(
    id: string,
    resupply: ReceivableResupply,
    packed: PackedLines | null = null,
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

  get received(): ResupplyTrace | null {
    return this.receivedTrace;
  }

  get lastChange(): ResupplyTrace | null {
    return this.trace;
  }

  /**
   * « Réceptionner » : toutes les lignes attendues deviennent reçues, d'un
   * geste. Refusé avant sa journée, à l'heure de Paris (l'envoi du fournil, R1d) : le stock
   * d'un jour ne compte que ce qui est arrivé ce jour-là. Refusé sur un
   * réassort sans commande : il est reçu ligne par ligne, et un « Réceptionner »
   * le marquerait reçu sans aucune ligne.
   */
  receiveAll(trace: ResupplyTrace): void {
    this.assertOrdered();
    const already = this.receivedTrace;
    if (already !== null) {
      throw alreadyReceivedBy(already);
    }
    if (instantToLocal(trace.at).day < this.serviceDay) {
      throw new ResupplyDayNotYetComeError(this.serviceDay);
    }
    this.lineList = this.lineList.map((line) => line.receivedAsExpected());
    this.receivedTrace = trace;
    this.trace = trace;
  }

  /**
   * Réassort sans commande : ajoute un article reçu, le jour même seulement
   * (E1, 2026-11-03 : la journée du geste à l'heure de Paris, celle de
   * l'horloge du serveur). Dans une autre unité, refusé en le disant (L2b-1).
   *
   * **Un double clic ne fait pas d'erreur** (E2, 2026-11-03) : le même
   * article, dans la même unité et à la même quantité, déjà sur la liste, est
   * le geste déjà fait — rien ne change, et `false` le dit pour que
   * l'appelant n'écrive rien. Une autre quantité reste refusée : c'est une
   * correction, et elle a son geste.
   *
   * @returns `true` si l'article vient d'être ajouté.
   * @throws {UnorderedReceiptNotTodayError} @throws {ReceiptLineAlreadyPresentError}
   */
  receive(line: ResupplyReceiptLine, trace: ResupplyTrace): boolean {
    this.assertUnordered();
    const today = instantToLocal(trace.at).day;
    if (this.serviceDay !== today) {
      throw new UnorderedReceiptNotTodayError(this.serviceDay, today);
    }
    const existing = this.lineList.find((candidate) => candidate.sku === line.sku);
    if (existing !== undefined && existing.saleUnit !== line.saleUnit) {
      throw new ResupplyLineUnitMismatchError(existing.sku, existing.label);
    }
    if (this.holds(line)) {
      return false;
    }
    if (existing !== undefined) {
      throw new ReceiptLineAlreadyPresentError(line.sku);
    }
    this.lineList = [...this.lineList, line];
    this.receivedTrace ??= trace;
    this.trace = trace;
    return true;
  }

  /** Vrai si cet article est déjà reçu, dans la même unité et à la même quantité (E2). */
  holds(line: ResupplyReceiptLine): boolean {
    return this.lineList.some(
      (candidate) =>
        candidate.sku === line.sku &&
        candidate.saleUnit === line.saleUnit &&
        candidate.receivedQuantity === line.receivedQuantity,
    );
  }

  /** Corrige le reçu d'un article — un écart, après réception seulement. */
  correct(sku: string, quantity: number, trace: ResupplyTrace): void {
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
  withdraw(sku: string, trace: ResupplyTrace): void {
    this.assertUnordered();
    const target = this.lineOf(sku);
    this.lineList = this.lineList.filter((line) => line !== target);
    this.trace = trace;
  }

  private assertOrdered(): void {
    if (this.resupplyId === null) {
      throw new ReceiptNotBoundToResupplyError();
    }
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

/**
 * Le refus d'un second « Réceptionner », nommant le geste qui a gagné : qui,
 * et quand à Paris. Partagé avec l'adaptateur, qui relit le reçu gagnant
 * quand la base refuse une réception concurrente.
 */
export function alreadyReceivedBy(received: ResupplyTrace): ResupplyAlreadyReceivedError {
  const at = instantToLocal(received.at);
  return new ResupplyAlreadyReceivedError(received.author.name, `le ${at.day} à ${at.time}`);
}

function assertServiceDay(serviceDay: string): void {
  if (!SERVICE_DAY.test(serviceDay)) {
    throw new InvalidServiceDayError(serviceDay);
  }
}

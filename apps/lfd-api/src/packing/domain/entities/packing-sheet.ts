import {
  BagOnDeliveryError,
  ContainersCountedError,
  ProposalOverContainersError,
  UnallocatedLinesError,
} from "../errors/packing-container-errors.js";
import {
  ContainerCeilingReachedError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
} from "../errors/packing-station-errors.js";
import {
  type ContainerLine,
  type ContainerMark,
  OrderContents,
  type PackingContainerState,
} from "./order-contents.js";

import {
  type ContainerMode,
  MAX_CONTAINERS_PER_ORDER,
  type PackingSheetSnapshot,
  type SheetLine,
  type SheetLineMark,
  type SheetMark,
} from "./packing-sheet.snapshot.js";

export {
  type ContainerMode,
  MAX_CONTAINERS_PER_ORDER,
  type PackingSheetSnapshot,
  type SheetLine,
  type SheetLineMark,
  type SheetMark,
};

/**
 * **Le bac d'une commande** — l'agrégat du poste de colisage (plan
 * `documentation/colisage/plan-domaine-colisage.md`, K2, §12.2).
 *
 * Une ligne est réversible tant que le bac est ouvert ; un bac fermé ne bouge
 * plus parce que le commerce a annoncé « prête » ; les contenants sont bornés.
 *
 * 🔴 **Une commande `counted` est en lecture seule** depuis K3c
 * (`plan-domaine-colisage.md` §17.3, §17.6) : colisée avec l'ancien poste,
 * elle ne se ferme, ne se rouvre ni ne se remplit plus ici
 * (`ContainersCountedError`). La coche, le compte « + / − » et le total de
 * containers sont partis avec l'ancien poste.
 *
 * Ce qu'il ne décide PAS : si la marchandise existe. C'est la réserve
 * (`PackingStock`) qui le dit ; le service du poste les fait parler ensemble,
 * sous verrou.
 */
export class PackingSheet {
  private readonly contents: OrderContents;

  private constructor(
    readonly serviceDay: string,
    readonly orderId: string,
    readonly reference: string,
    private packedValue: SheetMark | null,
    private containersValue: number,
    private linesValue: readonly SheetLine[],
    readonly containerMode: ContainerMode,
    containerList: readonly PackingContainerState[],
    readonly fulfillmentMethod: "pickup" | "delivery",
  ) {
    this.contents = OrderContents.of(reference, containerList);
  }

  static fromSnapshot(snapshot: PackingSheetSnapshot): PackingSheet {
    return new PackingSheet(
      snapshot.serviceDay,
      snapshot.orderId,
      snapshot.reference,
      snapshot.packed,
      snapshot.containers,
      snapshot.lines,
      snapshot.containerMode,
      snapshot.containerList,
      snapshot.fulfillmentMethod,
    );
  }

  get packed(): SheetMark | null {
    return this.packedValue;
  }

  get containers(): number {
    return this.containerMode === "listed" ? this.contents.liveCount : this.containersValue;
  }

  get containerList(): readonly PackingContainerState[] {
    return this.contents.containers;
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
   * Le bac est fermé — le fait irréversible du colisage.
   *
   * « Déjà fait » n'est pas un refus : c'est une réannonce (le rescan répare un
   * abonné perdu), décidée par l'appelant. La signature rendue est alors celle
   * d'ORIGINE, jamais celle du rescan.
   *
   * @throws {ContainersCountedError} une commande colisée avec l'ancien poste.
   * @throws {UnallocatedLinesError} une ligne n'est pas entièrement répartie.
   */
  seal(mark: SheetMark): { readonly mark: SheetMark; readonly fresh: boolean } {
    this.assertListed();
    if (this.packedValue !== null) {
      return { mark: this.packedValue, fresh: false };
    }
    this.assertAllAllocated();
    this.packedValue = mark;
    return { mark, fresh: true };
  }

  /**
   * **Rouvrir le rangement** d'un bac fermé (plan
   * `colisage/plan-domaine-colisage.md`, §17.2, option b de Hugo).
   *
   * Seul le rangement rouvre : les lignes restent au bac, les contenants
   * restent pleins, la réserve ne bouge pas. Le commerce garde la commande
   * « prête » — aucun fait n'en part —, et la refermer ne republie rien de
   * neuf (même clé de fait, absorbée par la boîte d'envoi).
   *
   * Ce que l'agrégat ne sait pas — un bac chargé, une tournée partie — est
   * refusé AVANT par la livraison (`BinDesk`), dans la même unité de travail.
   *
   * @returns `false` si le bac était déjà ouvert : rien à rouvrir, rien à écrire.
   * @throws {ContainersCountedError} une commande colisée avec l'ancien poste.
   */
  reopen(): boolean {
    this.assertListed();
    if (this.packedValue === null) {
      return false;
    }
    this.packedValue = null;
    return true;
  }

  /** Les bacs de livraison vivants de la commande — ceux que la livraison doit libérer. */
  get liveBinIds(): readonly string[] {
    return this.contents.liveBinIds;
  }

  toSnapshot(): PackingSheetSnapshot {
    return {
      serviceDay: this.serviceDay,
      orderId: this.orderId,
      reference: this.reference,
      packed: this.packedValue,
      containers: this.containers,
      lines: this.linesValue,
      containerMode: this.containerMode,
      containerList: this.contents.containers,
      fulfillmentMethod: this.fulfillmentMethod,
    };
  }

  // ── La colonne Contenants (K2b) ────────────────────────────────────────────

  /**
   * Un contenant de plus est-il permis ? Demandé AVANT qu'un bac ne naisse
   * chez la livraison.
   *
   * @throws {PackedOrderSealedError} @throws {ContainersCountedError}
   * @throws {ContainerCeilingReachedError}
   */
  assertCanOpenContainer(): void {
    this.assertListedAndOpen();
    if (this.contents.liveCount >= MAX_CONTAINERS_PER_ORDER) {
      throw new ContainerCeilingReachedError(this.reference, MAX_CONTAINERS_PER_ORDER);
    }
  }

  /**
   * « Proposer » est-il permis ? Une commande ouverte, `listed`, sans aucun
   * contenant vivant (suite de K2b, plan §7).
   *
   * @throws {PackedOrderSealedError} @throws {ContainersCountedError}
   * @throws {ProposalOverContainersError}
   */
  assertCanApplyProposal(): void {
    this.assertListedAndOpen();
    if (this.contents.liveCount > 0) {
      throw new ProposalOverContainersError(this.reference);
    }
  }

  /** Un contenant de plus — un bac déjà déclaré par la livraison, ou un sac. */
  openContainer(container: PackingContainerState): void {
    this.assertCanOpenContainer();
    if (container.nature === "bag" && this.fulfillmentMethod === "delivery") {
      throw new BagOnDeliveryError(this.reference);
    }
    this.contents.add(container);
  }

  /** Le contenant vivant, avant un geste qui doit d'abord passer ailleurs (le bac). */
  liveContainer(containerId: string): PackingContainerState {
    this.assertListedAndOpen();
    return this.contents.live(containerId);
  }

  /**
   * Répartit des pièces d'une ligne dans un contenant ; la ligne est au bac,
   * signée par ce geste, quand toute sa quantité est répartie.
   *
   * @returns les pièces que ce geste PREND à la réserve.
   */
  allocate(containerId: string, sku: string, quantity: number, mark: SheetMark): number {
    const line = this.listedLine(sku);
    const pieces = this.contents.allocate(containerId, line, quantity);
    this.markByAllocation(line, { ...mark, initials: "" });
    return pieces;
  }

  /** @returns les pièces que ce retrait d'un contenant REND à la réserve. */
  withdraw(containerId: string, sku: string, quantity: number): number {
    const line = this.listedLine(sku);
    const pieces = this.contents.withdraw(containerId, line, quantity);
    this.markByAllocation(line, null);
    return pieces;
  }

  /** Annule un contenant ; ses lignes restent, ignorées. @returns ce qui retourne à la réserve. */
  voidContainer(containerId: string, mark: ContainerMark): readonly ContainerLine[] {
    this.assertListedAndOpen();
    const released = this.contents.void(containerId, mark);
    for (const line of this.linesValue.filter((due) => released.some((r) => r.sku === due.sku))) {
      this.markByAllocation(line, null);
    }
    return released;
  }

  private listedLine(sku: string): SheetLine {
    this.assertListedAndOpen();
    return this.lineToTouch(sku);
  }

  /** Une ligne `listed` est au bac ssi toute sa quantité est répartie. */
  private markByAllocation(line: SheetLine, mark: SheetLineMark | null): void {
    const complete = this.contents.allocatedOf(line.sku) >= line.quantity;
    const packed = complete ? (mark ?? line.packed) : null;
    this.replaceLine({ ...line, packed });
  }

  private assertAllAllocated(): void {
    const short = this.contents.unallocated(this.linesValue);
    if (short.length > 0) {
      throw new UnallocatedLinesError(
        this.reference,
        short.map((line) => `« ${line.productName} »`),
      );
    }
  }

  private assertListedAndOpen(): void {
    this.assertOpen();
    this.assertListed();
  }

  private assertListed(): void {
    if (this.containerMode !== "listed") {
      throw new ContainersCountedError(this.reference);
    }
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

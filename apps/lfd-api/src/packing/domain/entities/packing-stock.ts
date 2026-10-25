import { StockReservationQuantityInvalidError } from "../errors/packing-resupply-errors.js";
import {
  ReserveShopQuantityInvalidError,
  ReserveShortForShopError,
} from "../errors/packing-shop-release-errors.js";
import { LineNotProducedYetError } from "../errors/packing-station-errors.js";
import { shortfall } from "../services/placement.js";
import {
  availableTo,
  awaitingOvenOf,
  reservedOf,
  type StockReservationSnapshot,
} from "../services/stock-reservations.js";

/** L'état d'une réserve, tel que l'adaptateur l'écrit et le relit. */
export interface PackingStockSnapshot {
  readonly serviceDay: string;
  readonly sku: string;
  /** Σ des remises reçues du fournil. */
  readonly received: number;
  /** Σ des pièces rendues au fournil. */
  readonly returned: number;
  /** Les pièces au bac, tous bacs confondus — une SOMME, pas une ligne. */
  readonly packed: number;
  /** Σ des pièces envoyées en boutique (plan A1, lot A1.4). */
  readonly sentToShop: number;
  /** Les réservations des réassorts lancés (R4b), levées comprises. */
  readonly reservations: readonly StockReservationSnapshot[];
}

/**
 * **La réserve d'un article pour une journée** — l'agrégat qui porte
 * l'invariant du colisage : `au bac + envoyé en boutique ≤ reçu − rendu` (plan
 * `documentation/colisage/colisage.md`, §10.1, §11 SÉRIEUX).
 *
 * Elle est LA ligne verrouillée : la mise au bac et le retour passent tous les
 * deux par elle, sous `SELECT … FOR UPDATE`, et c'est ce qui ferme la course du
 * §9 — deux postes ne prennent pas les mêmes douze croissants, et le fournil ne
 * reprend jamais ce qui est déjà dans un bac.
 *
 * `packed` est une somme : le jour où une ligne se répartira entre plusieurs
 * bacs (K2b), la réserve ne changera pas de forme.
 *
 * **La réservation d'un réassort lancé** (R4b, Q7) passe sous le même verrou :
 * le libre des commandes et des retours retire ce que les réservations
 * retiennent encore, et une fiche « au plus tôt » prend la sienne avant
 * tout le monde. Une réservation ne prend JAMAIS une pièce déjà au bac : si
 * le four n'a pas encore remis assez, elle attend les remises suivantes
 * (« en attente du four »), et le libre des commandes reste à zéro d'ici là.
 */
export class PackingStock {
  private constructor(
    readonly serviceDay: string,
    readonly sku: string,
    readonly received: number,
    private returnedValue: number,
    private packedValue: number,
    private sentToShopValue: number,
    private reservationsValue: readonly StockReservationSnapshot[],
  ) {}

  static fromSnapshot(snapshot: PackingStockSnapshot): PackingStock {
    return new PackingStock(
      snapshot.serviceDay,
      snapshot.sku,
      snapshot.received,
      snapshot.returned,
      snapshot.packed,
      snapshot.sentToShop,
      snapshot.reservations,
    );
  }

  get returned(): number {
    return this.returnedValue;
  }

  get packed(): number {
    return this.packedValue;
  }

  get sentToShop(): number {
    return this.sentToShopValue;
  }

  get reservations(): readonly StockReservationSnapshot[] {
    return this.reservationsValue;
  }

  /** Ce que les réservations retiennent encore. */
  get reserved(): number {
    return reservedOf(this.reservationsValue);
  }

  /**
   * Ce qui peut encore aller au bac d'une commande, être rendu ou envoyé en
   * boutique — hors des pièces réservées. Jamais négatif.
   */
  get free(): number {
    return Math.max(
      0,
      this.received - this.returnedValue - this.packedValue - this.sentToShopValue - this.reserved,
    );
  }

  /**
   * Des pièces entrent dans un bac.
   *
   * @throws {LineNotProducedYetError} la réserve ne les couvre pas — le refus
   *   dit combien il en manque, comme l'ancien poste.
   */
  take(quantity: number, productName: string): void {
    const missing = shortfall(this.free, quantity);
    if (missing > 0) {
      throw new LineNotProducedYetError(productName, missing);
    }
    this.packedValue += quantity;
  }

  /**
   * **Un réassort lancé réserve** (R4b) : il retient `quantity` pièces de la
   * réserve, qu'elles soient déjà sorties du four ou non — jamais refusé pour
   * manque, puisqu'il ne prend rien au bac. Une réservation existante, même
   * levée, reste telle quelle : le rejeu du fait ne réserve pas deux fois.
   *
   * @returns `true` si la réservation est neuve.
   * @throws {StockReservationQuantityInvalidError} pas un entier > 0.
   */
  reserve(resupplyId: string, quantity: number, at: Date): boolean {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new StockReservationQuantityInvalidError(this.sku, quantity);
    }
    if (this.reservationsValue.some((reservation) => reservation.resupplyId === resupplyId)) {
      return false;
    }
    this.reservationsValue = [
      ...this.reservationsValue,
      { resupplyId, quantity, packed: 0, reservedAt: at, releasedAt: null },
    ];
    return true;
  }

  /**
   * La fiche est close : sa réservation se lève, et ce qu'elle n'a pas
   * emballé redevient libre. Rien à lever (un réassort du soir, ou déjà
   * levée) : `false`.
   */
  lift(resupplyId: string, at: Date): boolean {
    const own = this.reservationsValue.find((reservation) => reservation.resupplyId === resupplyId);
    if (own === undefined || own.releasedAt !== null) {
      return false;
    }
    this.reservationsValue = this.reservationsValue.map((reservation) =>
      reservation === own ? { ...own, releasedAt: at } : reservation,
    );
    return true;
  }

  /**
   * **Une fiche de réassort emballe** : elle prend sur sa propre réservation,
   * jamais sur celle d'un réassort lancé avant elle (servi le premier) ; une
   * fiche du soir n'a que le libre des commandes.
   *
   * @throws {LineNotProducedYetError} le four n'a pas encore remis assez.
   */
  takeForResupply(resupplyId: string, quantity: number, productName: string): void {
    const missing = shortfall(availableTo(this, this.reservationsValue, resupplyId), quantity);
    if (missing > 0) {
      throw new LineNotProducedYetError(productName, missing);
    }
    this.packedValue += quantity;
    this.shiftOwnPacked(resupplyId, quantity);
  }

  /** La fiche emballe moins : les pièces reviennent, à sa réservation d'abord. */
  releaseFromResupply(resupplyId: string, quantity: number): void {
    this.packedValue = Math.max(0, this.packedValue - quantity);
    this.shiftOwnPacked(resupplyId, -quantity);
  }

  /** Ce que la réservation de `resupplyId` attend encore du four. */
  awaitingOven(resupplyId: string): number {
    return awaitingOvenOf(this, this.reservationsValue, resupplyId);
  }

  /**
   * **Des pièces sortent de la réserve vers une boutique** (plan A1, lot
   * A1.4) — le pain rendu par une annulation, ou tout surplus. Seulement du
   * libre : jamais une pièce au bac, ni une pièce qu'un réassort lancé
   * retient.
   *
   * @throws {ReserveShopQuantityInvalidError} pas un entier > 0.
   * @throws {ReserveShortForShopError} le libre ne couvre pas la quantité.
   */
  sendToShop(quantity: number, productName: string): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ReserveShopQuantityInvalidError(productName, quantity);
    }
    if (shortfall(this.free, quantity) > 0) {
      throw new ReserveShortForShopError(productName, this.serviceDay, this.free, quantity);
    }
    this.sentToShopValue += quantity;
  }

  /** Des pièces ressortent d'un bac et redeviennent disponibles. */
  release(quantity: number): void {
    this.packedValue = Math.max(0, this.packedValue - quantity);
  }

  /**
   * **Le colisage décide d'un retour** : il rend ce qui n'est pas au bac, au
   * plus ce qu'on lui demande (§10.2). `0` est un refus — tout est au bac —,
   * jamais une erreur : c'est une réponse, que le fournil affiche (Q5).
   *
   * @returns les pièces rendues.
   */
  giveBack(requested: number): number {
    const returned = Math.max(0, Math.min(requested, this.free));
    this.returnedValue += returned;
    return returned;
  }

  toSnapshot(): PackingStockSnapshot {
    return {
      serviceDay: this.serviceDay,
      sku: this.sku,
      received: this.received,
      returned: this.returnedValue,
      packed: this.packedValue,
      sentToShop: this.sentToShopValue,
      reservations: this.reservationsValue,
    };
  }

  private shiftOwnPacked(resupplyId: string, delta: number): void {
    this.reservationsValue = this.reservationsValue.map((reservation) =>
      reservation.resupplyId === resupplyId
        ? { ...reservation, packed: Math.max(0, reservation.packed + delta) }
        : reservation,
    );
  }
}

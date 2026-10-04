import { LineNotProducedYetError } from "../errors/packing-station-errors.js";

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
}

/**
 * **La réserve d'un article pour une journée** — l'agrégat qui porte
 * l'invariant du colisage : `au bac ≤ reçu − rendu` (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §10.1, §11 SÉRIEUX).
 *
 * Elle est LA ligne verrouillée : la mise au bac et le retour passent tous les
 * deux par elle, sous `SELECT … FOR UPDATE`, et c'est ce qui ferme la course du
 * §9 — deux postes ne prennent pas les mêmes douze croissants, et le fournil ne
 * reprend jamais ce qui est déjà dans un bac.
 *
 * `packed` est une somme : le jour où une ligne se répartira entre plusieurs
 * bacs (K2b), la réserve ne changera pas de forme.
 */
export class PackingStock {
  private constructor(
    readonly serviceDay: string,
    readonly sku: string,
    readonly received: number,
    private returnedValue: number,
    private packedValue: number,
  ) {}

  static fromSnapshot(snapshot: PackingStockSnapshot): PackingStock {
    return new PackingStock(
      snapshot.serviceDay,
      snapshot.sku,
      snapshot.received,
      snapshot.returned,
      snapshot.packed,
    );
  }

  get returned(): number {
    return this.returnedValue;
  }

  get packed(): number {
    return this.packedValue;
  }

  /** Ce qui peut encore aller au bac, ou être rendu. Jamais négatif. */
  get free(): number {
    return Math.max(0, this.received - this.returnedValue - this.packedValue);
  }

  /**
   * Des pièces entrent dans un bac.
   *
   * @throws {LineNotProducedYetError} la réserve ne les couvre pas — le refus
   *   dit combien il en manque, comme l'ancien poste.
   */
  take(quantity: number, productName: string): void {
    const missing = quantity - this.free;
    if (missing > 0) {
      throw new LineNotProducedYetError(productName, missing);
    }
    this.packedValue += quantity;
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
    const returned = Math.min(requested, this.free);
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
    };
  }
}

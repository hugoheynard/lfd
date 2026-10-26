import { InvalidShipmentRefError } from "../errors/production-errors.js";

/** Le rang de la commande elle-même ; au-delà, un reliquat (un BL de rang > 1). */
export const FIRST_SHIPMENT_RANK = 1;

/**
 * **Un envoi** — `(commande, rang)` (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, §1 et choix 12).
 *
 * Le rang 1 est la commande elle-même ; un rang > 1 est un reliquat, né d'une
 * décision de manque. Un value object plutôt qu'une chaîne `orderId#r` : une
 * chaîne se recoupe à la main, et un séparateur mal choisi devient un
 * identifiant (SÉRIEUX 10 de la seconde contradiction).
 *
 * Il vit dans le fournil et chacun de ses canaux le réexporte, comme
 * `ServiceDay` : tous les blocs en aval (colisage, livraison, retrait,
 * commerce) atteignent la production par un canal, aucun n'atteint les
 * autres. Une seule définition plutôt qu'une copie par bloc.
 */
export class ShipmentRef {
  private constructor(
    /** Identifiant OPAQUE de la commande côté commerce. */
    readonly orderId: string,
    readonly rank: number,
  ) {}

  /** @throws {InvalidShipmentRefError} commande vide ou rang < 1, non entier. */
  static of(orderId: string, rank: number): ShipmentRef {
    if (orderId === "" || !Number.isInteger(rank) || rank < FIRST_SHIPMENT_RANK) {
      throw new InvalidShipmentRefError(orderId, rank);
    }
    return new ShipmentRef(orderId, rank);
  }

  /** L'envoi de rang 1 — la commande elle-même. */
  static firstOf(orderId: string): ShipmentRef {
    return ShipmentRef.of(orderId, FIRST_SHIPMENT_RANK);
  }

  /**
   * Relit un envoi d'une charge utile `{ orderId, rank }` ; `null` s'il est
   * hors forme — l'appelant lève l'erreur de son fait.
   */
  static fromPayload(value: unknown): ShipmentRef | null {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    const record = new Map<string, unknown>(Object.entries(value));
    const orderId = record.get("orderId");
    const rank = record.get("rank");
    if (
      typeof orderId !== "string" ||
      orderId === "" ||
      typeof rank !== "number" ||
      !Number.isInteger(rank) ||
      rank < FIRST_SHIPMENT_RANK
    ) {
      return null;
    }
    return new ShipmentRef(orderId, rank);
  }

  toPayload(): { readonly orderId: string; readonly rank: number } {
    return { orderId: this.orderId, rank: this.rank };
  }

  /** Le segment de clé d'idempotence de l'envoi — cf. `shipmentKeySuffix`. */
  keySuffix(): string {
    return shipmentKeySuffix(this.rank);
  }

  equals(other: ShipmentRef): boolean {
    return this.orderId === other.orderId && this.rank === other.rank;
  }
}

/**
 * **Le segment de clé d'un envoi** : vide au rang 1, `:r<rang>` au-delà
 * (choix 6). Le rang 1 garde ainsi la clé d'avant à l'identique — rien de ce
 * qui est déjà dans la boîte d'envoi ne se rejoue — et un reliquat a la
 * sienne : sans elle, `ON CONFLICT (key) DO NOTHING` avalerait le second envoi
 * sans erreur.
 */
export function shipmentKeySuffix(rank: number): string {
  return rank === FIRST_SHIPMENT_RANK ? "" : `:r${String(rank)}`;
}

/**
 * Relit un rang de charge utile : absent → 1 (un fait écrit avant le rang),
 * entier ≥ 1 → lui, autre chose → `null` (l'appelant refuse le fait).
 */
export function shipmentRankOf(value: unknown): number | null {
  if (value === undefined) {
    return FIRST_SHIPMENT_RANK;
  }
  return typeof value === "number" && Number.isInteger(value) && value >= FIRST_SHIPMENT_RANK
    ? value
    : null;
}

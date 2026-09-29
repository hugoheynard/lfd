import type { DeliveryBag } from "../entities/delivery-bag.js";

/**
 * Port d'**écriture** des sacs (lot 4, L4-C16) : un sac se déclare, s'annule,
 * et se retrouve par son identifiant (QR) ou son code court (tapé).
 */
export abstract class DeliveryBagRepository {
  abstract load(bagId: string): Promise<DeliveryBag | null>;

  /** Le sac de ce code, annulé compris ; `null` si aucun. */
  abstract findByCode(code: string): Promise<DeliveryBag | null>;

  /** Ceux de ces codes déjà portés par un sac, annulé compris (L4-C20). */
  abstract codesTaken(codes: readonly string[]): Promise<ReadonlySet<string>>;

  /**
   * Écrit des sacs neufs.
   * @throws {BagCodeCollisionError} l'index des codes a vu une course.
   */
  abstract declare(bags: readonly DeliveryBag[]): Promise<void>;

  /** Écrit un sac changé (annulé). */
  abstract save(bag: DeliveryBag): Promise<void>;
}

import type { DeliveryBin } from "../entities/delivery-bin.js";

/**
 * Port d'**écriture** des bacs déclarés (lot 4, L4-C16 ; lot 4 bis, v2-4) :
 * un bac se déclare, se partage, s'annule, et se retrouve par son identifiant
 * (QR) ou son code court (tapé).
 */
export abstract class DeliveryBinRepository {
  abstract load(binId: string): Promise<DeliveryBin | null>;

  /** Le bac de ce code, annulé compris ; `null` si aucun. */
  abstract findByCode(code: string): Promise<DeliveryBin | null>;

  /** Ceux de ces codes déjà portés par un bac, annulé compris (L4-C20). */
  abstract codesTaken(codes: readonly string[]): Promise<ReadonlySet<string>>;

  /** Les moitiés NON annulées de ce bac physique — deux au plus. */
  abstract liveHalvesOf(physicalBinId: string): Promise<readonly DeliveryBin[]>;

  /**
   * Écrit des bacs neufs.
   * @throws {BinCodeCollisionError} l'index des codes a vu une course.
   * @throws {BinHalfRaceError} l'index des moitiés a vu une course.
   */
  abstract declare(bins: readonly DeliveryBin[]): Promise<void>;

  /** Écrit un bac changé (annulé). */
  abstract save(bin: DeliveryBin): Promise<void>;
}

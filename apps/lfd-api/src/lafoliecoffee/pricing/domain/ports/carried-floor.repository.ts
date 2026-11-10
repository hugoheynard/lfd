import type { PricingFloor } from "../entities/pricing-floor.js";
import type { PricingAct } from "../pricing-act.js";

/** Un plancher relu par son identifiant de version, et s'il est rangé. */
export interface StoredFloor {
  readonly floor: PricingFloor;
  readonly archivedAt: Date | null;
}

/**
 * Port d'**écriture** du report d'un plancher
 * (`plan-report-apres-detachement.md`, § 2.3) — distinct de
 * `PricingFloorRepository`, dont `pose` BORNE la limite en vigueur : un
 * report ne remplace jamais, il ajoute, et l'appelant a déjà refusé s'il y
 * avait quelque chose à remplacer.
 */
export abstract class CarriedFloorRepository {
  /** La version `id`, archivée comprise : c'est le domaine qui refuse. `null` si absente. */
  abstract load(id: string): Promise<StoredFloor | null>;

  /** Insère le plancher reporté et son acte, sans toucher aux autres. */
  abstract carry(floor: PricingFloor, act: PricingAct): Promise<void>;
}

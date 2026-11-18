import type { PackingTrackingLevel } from "../../domain/entities/packing-tracking-level.js";

/** Poser les réglages du colisage. Acte **staff** : `staffUserId` est figé dans la ligne. */
export class SetPackingSettingsCommand {
  constructor(
    readonly halfSharing: boolean,
    readonly staffUserId: string,
    /**
     * Absent : le réglage en vigueur (ou son défaut) reste — un appelant qui
     * ne connaît que le partage d'une moitié ne l'écrase pas.
     */
    readonly showMadeToOrder?: boolean,
    /** Absent : le niveau en vigueur (ou son défaut, `simple`) reste. */
    readonly pickupTrackingLevel?: PackingTrackingLevel,
  ) {}
}

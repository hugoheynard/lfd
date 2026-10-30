import { HalfSharingDisabledError } from "../errors/packing-settings-errors.js";

/** Les valeurs d'un réglage du colisage, telles qu'on les pose. */
export interface PackingSettingsValues {
  readonly halfSharing: boolean;
  /**
   * La pastille « Sur mesure » sur les lignes de l'écran du colisage (plan
   * sur mesure, M4 — Hugo, 2026-10-30) : affichée par défaut.
   */
  readonly showMadeToOrder: boolean;
}

/**
 * **Les réglages du colisage** (Réglages › Colisage, Hugo, 2026-10-25). Pas
 * d'agrégat à transitions : un réglage, mais qui REFUSE un geste du poste —
 * la règle vit donc ici, et non dans le handler qui l'appelle.
 */
export class PackingSettings implements PackingSettingsValues {
  private constructor(
    readonly halfSharing: boolean,
    readonly showMadeToOrder: boolean,
  ) {}

  /** Personne n'a rien réglé : le partage d'une moitié est fermé, le sur mesure affiché. */
  static defaults(): PackingSettings {
    return new PackingSettings(false, true);
  }

  static of(values: PackingSettingsValues): PackingSettings {
    return new PackingSettings(values.halfSharing, values.showMadeToOrder);
  }

  /** @throws {HalfSharingDisabledError} le partage d'une moitié est fermé. */
  assertCanShareHalf(): void {
    if (!this.halfSharing) {
      throw new HalfSharingDisabledError();
    }
  }

  equals(other: PackingSettings): boolean {
    return this.halfSharing === other.halfSharing && this.showMadeToOrder === other.showMadeToOrder;
  }
}

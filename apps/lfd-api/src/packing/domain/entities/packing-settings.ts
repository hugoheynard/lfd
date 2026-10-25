import { HalfSharingDisabledError } from "../errors/packing-settings-errors.js";

/**
 * **Les réglages du colisage** (Réglages › Colisage, Hugo, 2026-10-25). Pas
 * d'agrégat à transitions : un réglage, mais qui REFUSE un geste du poste —
 * la règle vit donc ici, et non dans le handler qui l'appelle.
 */
export class PackingSettings {
  private constructor(readonly halfSharing: boolean) {}

  /** Personne n'a rien réglé : le partage d'une moitié est fermé. */
  static defaults(): PackingSettings {
    return new PackingSettings(false);
  }

  static of(values: { readonly halfSharing: boolean }): PackingSettings {
    return new PackingSettings(values.halfSharing);
  }

  /** @throws {HalfSharingDisabledError} le partage d'une moitié est fermé. */
  assertCanShareHalf(): void {
    if (!this.halfSharing) {
      throw new HalfSharingDisabledError();
    }
  }

  equals(other: PackingSettings): boolean {
    return this.halfSharing === other.halfSharing;
  }
}

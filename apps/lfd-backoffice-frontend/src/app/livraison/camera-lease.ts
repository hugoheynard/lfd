import { Injectable, signal } from '@angular/core';

/**
 * **Une seule caméra à la fois sur la page.** L'écran de chargement porte
 * deux lecteurs de QR (le sien, et celui du panneau d'une rangée) ; sur un
 * téléphone, deux flux ouverts se disputent l'appareil et chauffent. Le
 * lecteur qui s'allume prend le bail ; celui qui le perd s'éteint.
 */
@Injectable({ providedIn: 'root' })
export class CameraLease {
  private readonly owner = signal<symbol | null>(null);

  /** Le détenteur du bail, `null` : aucune caméra allumée. */
  readonly holder = this.owner.asReadonly();

  claim(token: symbol): void {
    this.owner.set(token);
  }

  release(token: symbol): void {
    if (this.owner() === token) {
      this.owner.set(null);
    }
  }
}

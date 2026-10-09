import { Injectable, signal } from '@angular/core';
import type { FoldPanelRef } from 'fold-ng';

/** Les feuilles qu'ouvre un bouton de la barre. */
export type BarSheetKey = 'cart' | 'notifications';

/**
 * **Une seule feuille de barre à la fois** (Hugo, 2026-10-09).
 *
 * En pile, le panier et les notifications s'ouvrent en feuille du bas NON
 * modale : la barre reste cliquable, donc on peut ouvrir l'une par-dessus
 * l'autre — et elles s'empilaient. Ce service tient la référence de la feuille
 * ouverte : ouvrir l'une ferme l'autre, recliquer sur la même la referme. Le
 * panier et la cloche passent par lui sans se connaître.
 */
@Injectable({ providedIn: 'root' })
export class BarSheet {
  private current: { readonly key: BarSheetKey; readonly ref: FoldPanelRef<void> } | null = null;

  /** La feuille ouverte, pour `aria-expanded`. */
  readonly openKey = signal<BarSheetKey | null>(null);

  async toggle(
    key: BarSheetKey,
    open: () => FoldPanelRef<void> | Promise<FoldPanelRef<void>>,
  ): Promise<void> {
    const previous = this.current;
    if (previous !== null) {
      this.forget();
      previous.ref.close();
      if (previous.key === key) {
        return;
      }
    }
    const ref = await open();
    this.current = { key, ref };
    this.openKey.set(key);
    void ref.closed.then(() => {
      if (this.current?.ref === ref) {
        this.forget();
      }
    });
  }

  private forget(): void {
    this.current = null;
    this.openKey.set(null);
  }
}

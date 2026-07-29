import { Injectable, computed, signal } from '@angular/core';

/**
 * Favourites — a session-level set of product ids, shared across the Boutique
 * and Catalogue pages so a heart toggled in one shows everywhere. POC only
 * (in-memory); the real store will persist per client account.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly _ids = signal<ReadonlySet<string>>(new Set());

  /** The favourited product ids. */
  readonly ids = this._ids.asReadonly();
  /** How many products are favourited. */
  readonly count = computed(() => this._ids().size);

  has(id: string): boolean {
    return this._ids().has(id);
  }

  toggle(id: string): void {
    this._ids.update((set) => {
      const next = new Set(set);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
}

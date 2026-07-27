import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

import { DB_SEED, type DbShape } from './db.seed';

// Bumper la clé invalide tout localStorage à l'ancienne forme à chaque
// changement de schéma. v2 : SalesChannels per-boutique. v3 : régimes de TVA
// (tvaRegimes + category.emporterTvaId/surPlaceTvaId au lieu de fiscalCategory).
const STORAGE_KEY = 'lfc-pim:db:v3';

/**
 * La base du POC, côté navigateur. **Aucun serveur** :
 *
 * - au premier chargement d'une machine vierge, l'état vient du seed embarqué
 *   dans le build (`DB_SEED`) — c'est ce qui rend la démo GitHub Pages possible ;
 * - chaque écriture est recopiée dans `localStorage`, donc les actions survivent
 *   au rechargement sur cette machine ;
 * - en SSR / prérendu, il n'y a pas de `localStorage` : on sert le seed en
 *   lecture seule (les mutations n'y arrivent jamais, elles suivent un clic).
 *
 * L'état est un `signal` : les services le lisent, les pages restent réactives.
 */
@Injectable({ providedIn: 'root' })
export class LocalDb {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = signal<DbShape>(this.load());

  /** Lecture réactive de l'état courant. */
  readonly snapshot = this.state.asReadonly();

  /** Applique une mutation sur une copie, publie le nouvel état, persiste. */
  update(mutator: (draft: DbShape) => void): void {
    const draft = structuredClone(this.state());
    mutator(draft);
    this.state.set(draft);
    this.persist(draft);
  }

  /** Repart du seed embarqué — le bouton « Réinitialiser » de la démo. */
  reset(): void {
    const fresh = structuredClone(DB_SEED);
    this.state.set(fresh);
    this.persist(fresh);
  }

  /** Sérialisation lisible — alimente l'export « DB → repo ». */
  serialize(): string {
    return JSON.stringify(this.state(), null, 2);
  }

  private load(): DbShape {
    if (this.isBrowser) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        try {
          return JSON.parse(raw) as DbShape;
        } catch {
          // Storage corrompu (édité à la main, version obsolète) : on repart du seed.
        }
      }
    }
    return structuredClone(DB_SEED);
  }

  private persist(db: DbShape): void {
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    }
  }
}

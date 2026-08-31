import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { IngredientView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../../../../data/api';

/**
 * Ce qu'**une fiche** cite comme provenance.
 *
 * Un magasin à part de `ProductFormStore`, et ce n'est pas de la commodité :
 * les ingrédients sont un AUTRE agrégat, avec sa table de liaison et son propre
 * point d'API. Les verser dans l'instantané positionnel du formulaire aurait
 * rallongé de six branches un fichier qui en compte déjà treize cents, pour
 * une donnée que le geste « Tout enregistrer » n'a jamais eu à porter.
 *
 * Il est fourni **par la section** (et non `providedIn: 'root'`) : deux fiches
 * ouvertes l'une après l'autre ne doivent pas se passer leur liste.
 */
@Injectable()
export class ProductIngredientsStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  private readonly saved = signal<readonly string[]>([]);
  private readonly draft = signal<readonly string[]>([]);
  /** Les clés citées, dans l'ordre affiché. */
  readonly keys = this.draft.asReadonly();
  readonly busy = signal(false);

  /** Le détail de ce que la fiche cite — nom, origine, appellation. */
  readonly cited = signal<readonly IngredientView[]>([]);

  /** La liste diffère-t-elle de la dernière enregistrée — l'ORDRE compris ? */
  readonly dirty = computed(() => {
    const before = this.saved();
    const now = this.draft();
    return before.length !== now.length || before.some((key, at) => key !== now[at]);
  });

  /** Charge ce que la fiche cite. Une fiche en création n'a rien à charger. */
  async load(productId: string): Promise<void> {
    if (productId === '') {
      this.reset([]);
      return;
    }
    const rows = await firstValueFrom(
      this.http.get<IngredientView[]>(`${this.base}/products/${productId}/ingredients`),
    );
    this.cited.set([...rows]);
    this.reset(rows.map((row) => row.key));
  }

  add(key: string): void {
    if (!this.draft().includes(key)) {
      this.draft.update((keys) => [...keys, key]);
    }
  }

  remove(key: string): void {
    this.draft.update((keys) => keys.filter((current) => current !== key));
  }

  /** Remonte un ingrédient d'un cran — l'ordre est l'argument de vente. */
  moveUp(key: string): void {
    this.draft.update((keys) => {
      const at = keys.indexOf(key);
      if (at <= 0) {
        return keys;
      }
      const next = [...keys];
      const previous = next[at - 1];
      const current = next[at];
      if (previous === undefined || current === undefined) {
        return keys;
      }
      next[at - 1] = current;
      next[at] = previous;
      return next;
    });
  }

  async save(productId: string): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.put(`${this.base}/products/${productId}/ingredients`, { keys: this.draft() }),
      );
      await this.load(productId);
    } finally {
      this.busy.set(false);
    }
  }

  /** Retour à la dernière liste enregistrée. */
  revert(): void {
    this.draft.set([...this.saved()]);
  }

  private reset(keys: readonly string[]): void {
    this.saved.set([...keys]);
    this.draft.set([...keys]);
  }
}

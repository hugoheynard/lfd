import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import type {
  AppellationView,
  CreateAppellationPayload,
  CreateIngredientPayload,
  IngredientView,
  UpdateAppellationPayload,
  UpdateIngredientPayload,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Les deux référentiels de **provenance** — appellations et ingrédients.
 *
 * Un seul magasin pour deux listes, parce que ce sont deux moitiés d'une même
 * chose : l'écran des ingrédients a besoin des appellations pour proposer un
 * signe, et celui des appellations a besoin du compte de ceux qui les portent.
 * Deux magasins auraient chacun rechargé l'autre.
 *
 * Il ÉCRIT aussi : le serveur exige `catalog:write` sur tout ce qui n'est pas un
 * `GET`. Le front cache les gestes, le serveur les refuse — le second protège,
 * le premier évite d'offrir un bouton qui répondrait 403.
 */
@Injectable({ providedIn: 'root' })
export class ProvenanceStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly appellationState = signal<AppellationView[]>([]);
  private readonly ingredientState = signal<IngredientView[]>([]);
  readonly appellations = this.appellationState.asReadonly();
  readonly ingredients = this.ingredientState.asReadonly();

  /** Celles qu'on peut encore POSER — une appellation retirée ne se propose plus. */
  readonly offeredAppellations = computed(() =>
    this.appellationState().filter((row) => row.active),
  );

  private readonly appellationLoad = new ListLoadState();
  private readonly ingredientLoad = new ListLoadState();
  readonly appellationError = this.appellationLoad.error;
  readonly ingredientError = this.ingredientLoad.error;

  constructor() {
    if (this.isBrowser) {
      void this.reload().catch(() => undefined);
    }
  }

  /** Les deux listes, en parallèle : elles se lisent toujours ensemble. */
  async reload(): Promise<void> {
    await Promise.all([this.reloadAppellations(), this.reloadIngredients()]);
  }

  async reloadAppellations(): Promise<void> {
    await this.appellationLoad.run(
      () => firstValueFrom(this.http.get<AppellationView[]>(`${this.base}/appellations`)),
      (items) => this.appellationState.set([...items]),
    );
  }

  async reloadIngredients(): Promise<void> {
    await this.ingredientLoad.run(
      () => firstValueFrom(this.http.get<IngredientView[]>(`${this.base}/ingredients`)),
      (items) => this.ingredientState.set([...items]),
    );
  }

  async createAppellation(payload: CreateAppellationPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/appellations`, payload));
    await this.reloadAppellations();
  }

  async updateAppellation(code: string, payload: UpdateAppellationPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${this.base}/appellations/${code}`, payload));
    // Les deux : un libellé d'appellation s'affiche AUSSI sur ses ingrédients.
    await this.reload();
  }

  async removeAppellation(code: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/appellations/${code}`));
    await this.reloadAppellations();
  }

  async createIngredient(payload: CreateIngredientPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/ingredients`, payload));
    await this.reload();
  }

  async updateIngredient(key: string, payload: UpdateIngredientPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${this.base}/ingredients/${key}`, payload));
    await this.reload();
  }

  async removeIngredient(key: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/ingredients/${key}`));
    await this.reload();
  }
}

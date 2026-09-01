import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import type {
  AllergenEntry,
  AllergenScope,
  AppellationView,
  CreateAppellationPayload,
  CreateIngredientPayload,
  IngredientView,
  SetIngredientAllergensPayload,
  UpdateAppellationPayload,
  UpdateIngredientPayload,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { ReferenceApi } from '../catalogue/reference-api';
import { API_BASE_URL } from '../data/api';
import { ListLoadState } from '../data/list-load-state';

/**
 * Le périmètre offert à une **matière** est `world`, jamais `eu` (D4).
 *
 * Un ingrédient énonce un FAIT : une farine qui contient du sarrasin en
 * contient, que l'Europe l'exige ou non. Servir le catalogue `eu` rendrait
 * `BWD`, `NM` et `SO` impossibles à poser ici — le filtre européen appartient à
 * la déclaration de la déclinaison, pas à la matière.
 */
const INGREDIENT_ALLERGEN_SCOPE: AllergenScope = 'world';

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
 *
 * Il sert enfin le **référentiel allergènes** au panneau ingrédient, par
 * {@link ReferenceApi} plutôt qu'en tapant l'URL lui-même : `/reference/*` a
 * déjà son client, et le recopier ici ferait deux endroits à corriger le jour
 * où la route bouge.
 */
@Injectable({ providedIn: 'root' })
export class ProvenanceStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);
  private readonly reference = inject(ReferenceApi);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly appellationState = signal<AppellationView[]>([]);
  private readonly ingredientState = signal<IngredientView[]>([]);
  readonly appellations = this.appellationState.asReadonly();
  readonly ingredients = this.ingredientState.asReadonly();

  /** Celles qu'on peut encore POSER — une appellation retirée ne se propose plus. */
  readonly offeredAppellations = computed(() =>
    this.appellationState().filter((row) => row.active),
  );

  private readonly allergenState = signal<readonly AllergenEntry[]>([]);
  /** Le catalogue `world` des allergènes — ce qu'on peut poser sur une matière. */
  readonly allergenEntries = this.allergenState.asReadonly();

  private readonly appellationLoad = new ListLoadState();
  private readonly ingredientLoad = new ListLoadState();
  private readonly allergenLoad = new ListLoadState();
  readonly appellationError = this.appellationLoad.error;
  readonly ingredientError = this.ingredientLoad.error;
  readonly allergenError = this.allergenLoad.error;

  private readonly allergenBusy = signal(false);
  /**
   * Le référentiel est en route.
   *
   * Les deux listes de provenance n'en ont pas besoin — elles partent vides et
   * se remplissent. Celui-ci si : un sélecteur d'allergènes sans option ne se
   * distingue pas d'un référentiel vide, et l'écran dirait « rien à cocher » là
   * où la réponse n'est simplement pas arrivée.
   */
  readonly allergensLoading = this.allergenBusy.asReadonly();

  /** Lu une fois par session : un référentiel réglementé ne bouge pas en cours de route. */
  private allergensLoaded = false;

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

  /**
   * Charge le référentiel allergènes s'il manque — appelé à l'ouverture du
   * panneau ingrédient, pas au démarrage : l'écran des appellations n'en a que
   * faire, et le payer sur chaque visite du module serait une requête pour rien.
   *
   * Un échec laisse `allergensLoaded` à `false`, donc un second appel réessaie :
   * c'est ce qui fait du bouton « Réessayer » du panneau un vrai geste.
   */
  async ensureAllergens(): Promise<void> {
    if (this.allergensLoaded) {
      return;
    }
    this.allergenBusy.set(true);
    try {
      await this.allergenLoad.run(
        () => this.reference.allergens(INGREDIENT_ALLERGEN_SCOPE),
        (reference) => {
          this.allergenState.set([...reference.entries]);
          this.allergensLoaded = true;
        },
      );
    } finally {
      this.allergenBusy.set(false);
    }
  }

  /**
   * Pose ce que cette matière **contient** — la liste ENTIÈRE, pas un delta.
   *
   * Seuls les ingrédients se rechargent : un code d'allergène ne change rien à
   * une appellation.
   */
  async setIngredientAllergens(key: string, codes: readonly string[]): Promise<void> {
    const payload: SetIngredientAllergensPayload = { codes: [...codes] };
    await firstValueFrom(this.http.put(`${this.base}/ingredients/${key}/allergens`, payload));
    await this.reloadIngredients();
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

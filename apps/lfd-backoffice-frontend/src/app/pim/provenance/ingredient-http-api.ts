import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AppellationView,
  CreateIngredientPayload,
  IngredientView,
  ProductIngredientAllergensView,
  SetIngredientAllergensPayload,
  SetProductIngredientsPayload,
  UpdateIngredientPayload,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Les routes des **ingrédients** et des **appellations**, sans état — pour un
 * appelant qui veut la réponse ou le refus, pas une liste en signal.
 *
 * Pourquoi pas {@link ProvenanceStore} : il range ses lectures dans un état
 * partagé et absorbe leur échec dans un signal d'erreur (`ListLoadState`), et
 * chacune de ses écritures recharge les deux listes de l'écran. Un outil agent
 * doit voir le refus du serveur tel quel (doc `outils-webmcp-pim.md`, A.1 :
 * viser l'API, jamais le store). Et `ProductIngredientsStore` tient un
 * brouillon fourni par la section d'une fiche, hors d'atteinte ici.
 *
 * ⚠️ Chemin de base VIDE côté serveur pour `products/:id/ingredients` : ces
 * routes vivent sous `/pim/products/…`, pas sous `/pim/catalogue/…` (cf.
 * `ProductHttpApi.citedAllergens`).
 */
@Injectable({ providedIn: 'root' })
export class IngredientHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  ingredients(): Promise<IngredientView[]> {
    return firstValueFrom(this.http.get<IngredientView[]>(`${this.base}/ingredients`));
  }

  appellations(): Promise<AppellationView[]> {
    return firstValueFrom(this.http.get<AppellationView[]>(`${this.base}/appellations`));
  }

  /** Ce que la fiche cite, dans l'ordre affiché. */
  ofProduct(productId: string): Promise<IngredientView[]> {
    return firstValueFrom(
      this.http.get<IngredientView[]>(`${this.base}/products/${productId}/ingredients`),
    );
  }

  /** Ce que la composition MENTIONNE (D5) — une proposition, jamais une déclaration. */
  citedAllergens(productId: string): Promise<ProductIngredientAllergensView> {
    return firstValueFrom(
      this.http.get<ProductIngredientAllergensView>(
        `${this.base}/products/${productId}/ingredient-allergens`,
      ),
    );
  }

  async create(payload: CreateIngredientPayload): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/ingredients`, payload));
  }

  /** Corrige nom, origine ou description ; la clé reste gelée. */
  async update(key: string, payload: UpdateIngredientPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${this.base}/ingredients/${key}`, payload));
  }

  /** La liste ENTIÈRE de ce que la matière contient, pas un delta. */
  async setAllergens(key: string, payload: SetIngredientAllergensPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${this.base}/ingredients/${key}/allergens`, payload));
  }

  /** La liste ENTIÈRE et ordonnée de ce que la fiche cite. */
  async setOfProduct(productId: string, payload: SetProductIngredientsPayload): Promise<void> {
    await firstValueFrom(this.http.put(`${this.base}/products/${productId}/ingredients`, payload));
  }
}

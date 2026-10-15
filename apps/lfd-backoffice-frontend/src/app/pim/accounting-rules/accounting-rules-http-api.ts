import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AccountingRulesView,
  ProPriceMethod,
  ProPricePrefillPreviewView,
} from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { API_BASE_URL } from '../data/api';

/**
 * Accès aux **règles comptables** — le réglage unique de la maison.
 *
 * Aucune forme déclarée ici : `AccountingRulesView` vient du contrat. Le front
 * ne redit pas ce que l'API affirme (cf. `lint:api-types-from-contracts`).
 */
@Injectable({ providedIn: 'root' })
export class AccountingRulesHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  read(): Promise<AccountingRulesView> {
    return firstValueFrom(this.http.get<AccountingRulesView>(this.url()));
  }

  /**
   * Le `PUT` rend la vue relue : la date du dernier réglage est un fait du
   * serveur. La recalculer ici afficherait l'heure du navigateur pour une
   * écriture faite ailleurs.
   */
  setProPriceRatio(ratioBp: number): Promise<AccountingRulesView> {
    return firstValueFrom(
      this.http.put<AccountingRulesView>(`${this.url()}/pro-price-ratio`, { ratioBp }),
    );
  }

  /**
   * Choisit la méthode appliquée — une route à part de celle du rapport.
   *
   * Deux décisions, chacune retarife le catalogue professionnel : les fondre
   * rendrait impossible de lire dans le journal laquelle a produit quel écart.
   */
  chooseProPriceMethod(method: ProPriceMethod): Promise<AccountingRulesView> {
    return firstValueFrom(
      this.http.put<AccountingRulesView>(`${this.url()}/pro-price-method`, { method }),
    );
  }

  /**
   * **L'aperçu du pré-remplissage du prix pro** (lot P, P5) — lecture seule :
   * par déclinaison, le HT servi aujourd'hui et le HT que l'écriture poserait.
   */
  previewProPricePrefill(): Promise<ProPricePrefillPreviewView> {
    return firstValueFrom(
      this.http.get<ProPricePrefillPreviewView>(`${this.url()}/pro-price-prefill`),
    );
  }

  /**
   * **Écrit le pré-remplissage**, et rend l'aperçu relu. Le serveur recalcule
   * tout et refuse au moindre écart : ce qu'on a vu à l'écran ne décide pas.
   */
  applyProPricePrefill(): Promise<ProPricePrefillPreviewView> {
    return firstValueFrom(
      this.http.post<ProPricePrefillPreviewView>(`${this.url()}/pro-price-prefill`, {}),
    );
  }

  private url(): string {
    return `${this.base}/accounting-rules`;
  }
}

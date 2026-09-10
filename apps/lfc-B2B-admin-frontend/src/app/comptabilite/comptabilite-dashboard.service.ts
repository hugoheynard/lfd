import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { CatalogSummaryView, CustomerPortfolioView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Ce que le tableau de bord de la comptabilité lit — et les deux fichiers qu'il
 * rend.
 *
 * Un service à lui plutôt que deux appels ajoutés aux services existants
 * (`AdminCompaniesService`, `CatalogueService`) : ces deux-là sont des services
 * d'ÉCRAN, ils portent aussi les écritures de leur page. Le tableau de bord ne
 * fait que lire, et lire chez deux voisins ; l'accrocher à l'un des deux
 * l'aurait rangé sous le mauvais sujet.
 *
 * Deux appels, pas un. Le serveur pourrait composer les deux synthèses en une
 * réponse, et il ne le fait pas : elles appartiennent à deux contextes murés par
 * deux droits différents, et une route unique devrait choisir lequel exiger. Le
 * front compose, chaque mur reste le sien — et deux requêtes pour un tableau de
 * bord ne sont pas un facteur, ce sont deux requêtes.
 */
@Injectable({ providedIn: 'root' })
export class ComptabiliteDashboardService {
  private readonly http = inject(HttpClient);

  async customers(): Promise<CustomerPortfolioView> {
    return firstValueFrom(
      this.http.get<CustomerPortfolioView>(`${B2B_API_BASE}/admin/companies/portfolio`),
    );
  }

  async catalog(): Promise<CatalogSummaryView> {
    return firstValueFrom(
      this.http.get<CatalogSummaryView>(`${B2B_API_BASE}/admin/catalog/summary`),
    );
  }

  /**
   * Les exports, en **blob** et non par un lien.
   *
   * `responseType: 'blob'` et pas `'text'` : le corps porte un BOM UTF-8, et le
   * faire transiter par une chaîne JavaScript le collerait au premier caractère
   * du fichier enregistré — visible dans le tableur, sous la forme d'un
   * « ï»¿Référence » en tête de la première colonne.
   */
  async customersCsv(): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/companies/export.csv`, { responseType: 'blob' }),
    );
  }

  async catalogCsv(): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/catalog/export.csv`, { responseType: 'blob' }),
    );
  }
}

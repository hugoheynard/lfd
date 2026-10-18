import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  StaffSuggestionChoicesView,
  StaffSuggestionOrder,
  StaffSuggestionOrderView,
  StaffSuggestionPreviewPayload,
  StaffSuggestionPreviewView,
  StaffSuggestionResultPeriod,
  StaffSuggestionResultsView,
  StaffSuggestionRuleIdResponse,
  StaffSuggestionRulePayload,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Les suggestions décidées par le staff** — `/admin/suggestions`
 * (`documentation/recommandation-produit/suggestions-du-staff.md`, RS1
 * RS3 et RS6), sous `lfc_suggestions`. Les écritures rendent l'id ; l'écran relit.
 */
@Injectable({ providedIn: 'root' })
export class StaffSuggestionsService {
  private readonly http = inject(HttpClient);

  /** Toutes, archivées comprises, la plus récemment créée d'abord. */
  list(): Promise<readonly StaffSuggestionRuleView[]> {
    return firstValueFrom(this.http.get<readonly StaffSuggestionRuleView[]>(this.url()));
  }

  create(payload: StaffSuggestionRulePayload): Promise<StaffSuggestionRuleIdResponse> {
    return firstValueFrom(this.http.post<StaffSuggestionRuleIdResponse>(this.url(), payload));
  }

  /** La règle entière : un `PUT` remplace tout. */
  revise(id: string, payload: StaffSuggestionRulePayload): Promise<StaffSuggestionRuleIdResponse> {
    return this.put(encodeURIComponent(id), payload);
  }

  /** Couper (`false`) ou rallumer, sans rien supprimer. */
  setActive(id: string, active: boolean): Promise<StaffSuggestionRuleIdResponse> {
    return this.put(`${encodeURIComponent(id)}/active`, { active });
  }

  archive(id: string): Promise<StaffSuggestionRuleIdResponse> {
    return this.put(`${encodeURIComponent(id)}/archive`, {});
  }

  order(): Promise<StaffSuggestionOrderView> {
    return firstValueFrom(this.http.get<StaffSuggestionOrderView>(this.url('order')));
  }

  setOrder(order: StaffSuggestionOrder): Promise<void> {
    return firstValueFrom(this.http.put<void>(this.url('order'), { order }));
  }

  /** Les articles servis et leurs familles, pour l'éditeur. */
  choices(): Promise<StaffSuggestionChoicesView> {
    return firstValueFrom(this.http.get<StaffSuggestionChoicesView>(this.url('choices')));
  }

  /**
   * Par règle, sur les `days` derniers jours métier (RS6) : affichée,
   * cliquée, ajoutée, taux d'ajout, puis commandées et chiffre d'affaires HT
   * ESTIMÉS.
   */
  results(days: StaffSuggestionResultPeriod): Promise<StaffSuggestionResultsView> {
    return firstValueFrom(
      this.http.get<StaffSuggestionResultsView>(this.url('results'), {
        params: { days: String(days) },
      }),
    );
  }

  /** L'aperçu (RS5) : ce que la boutique afficherait, et pourquoi chaque règle s'affiche ou non. */
  preview(payload: StaffSuggestionPreviewPayload): Promise<StaffSuggestionPreviewView> {
    return firstValueFrom(this.http.post<StaffSuggestionPreviewView>(this.url('preview'), payload));
  }

  private put(tail: string, body: object): Promise<StaffSuggestionRuleIdResponse> {
    return firstValueFrom(this.http.put<StaffSuggestionRuleIdResponse>(this.url(tail), body));
  }

  private url(tail?: string): string {
    const root = `${B2B_API_BASE}/admin/suggestions`;
    return tail === undefined ? root : `${root}/${tail}`;
  }
}

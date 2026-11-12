import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ApplyPriceTemplatePayload,
  CreatedIdResponse,
  MercurialeBenchmarkView,
  PosedRulesResponse,
  PriceTemplateKind,
  PriceTemplateView,
  SavePriceTemplatePayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { GestureIntents, intentOptions } from '../../shared/gesture-intents';

/**
 * **Les gabarits tarifaires** — mercuriales et devis, un seul service.
 *
 * Les deux portent exactement la même chose : une grille de prix. Un second
 * service par nature aurait dupliqué quatre appels pour un discriminant.
 */
@Injectable({ providedIn: 'root' })
export class PriceTemplatesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/pricing/templates`;
  private readonly composeIntents = new GestureIntents();

  async list(kind: PriceTemplateKind): Promise<readonly PriceTemplateView[]> {
    return firstValueFrom(
      this.http.get<readonly PriceTemplateView[]>(this.base, { params: { kind } }),
    );
  }

  /** Un gabarit et sa grille — le tarif catalogue en regard vient du serveur. */
  async byId(id: string): Promise<PriceTemplateView> {
    return firstValueFrom(
      this.http.get<PriceTemplateView>(`${this.base}/${encodeURIComponent(id)}`),
    );
  }

  /**
   * **Ce que le marché paie déjà**, article par article — l'indicateur d'aide.
   *
   * Lu une fois avec la grille et non par article : quatre-vingt-douze appels
   * pour un écran qu'on ouvre pour lire seraient absurdes, et la médiane d'un
   * article se calcule de toute façon sur la même passe que celle des autres.
   */
  async benchmark(): Promise<readonly MercurialeBenchmarkView[]> {
    return firstValueFrom(
      this.http.get<readonly MercurialeBenchmarkView[]>(`${this.base}/benchmark`),
    );
  }

  /**
   * **Enregistre un gabarit neuf**, une fois par intention (`Idempotency-Key`,
   * exigée par l'API) : l'intention est la grille envoyée. Un double clic ou
   * un réessai après une réponse perdue renvoie la même clé et reçoit le même
   * gabarit ; une grille changée, ou un enregistrement abouti, en ouvre une
   * neuve.
   */
  async compose(payload: SavePriceTemplatePayload): Promise<CreatedIdResponse> {
    const subject = JSON.stringify(payload);
    const created = await firstValueFrom(
      this.http.post<CreatedIdResponse>(
        this.base,
        payload,
        intentOptions(this.composeIntents.keyFor(subject)),
      ),
    );
    this.composeIntents.done(subject);
    return created;
  }

  /** Une grille se remplace **entière** : `PUT`, jamais un palier à la fois. */
  async revise(id: string, payload: SavePriceTemplatePayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${encodeURIComponent(id)}`, payload));
  }

  /**
   * **Archiver** — le gabarit sort des listes de choix ; les mercuriales déjà
   * posées depuis lui portent leurs propres lignes et ne changent pas.
   */
  async archive(id: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${this.base}/${encodeURIComponent(id)}/archive`, null),
    );
  }

  /** Rend le nombre de règles posées — une ligne à deux paliers en pose deux. */
  async apply(id: string, payload: ApplyPriceTemplatePayload): Promise<PosedRulesResponse> {
    return firstValueFrom(
      this.http.post<PosedRulesResponse>(`${this.base}/${encodeURIComponent(id)}/apply`, payload),
    );
  }
}

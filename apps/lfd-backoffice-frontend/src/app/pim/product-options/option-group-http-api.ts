import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreatedIdResponse } from '@lfd/contracts';
import type { OptionGroupPayload, OptionGroupView } from '@lfd/pim-contracts';
import { firstValueFrom } from 'rxjs';

import { intentOptions } from '../../shared/gesture-intents';
import { API_BASE_URL } from '../data/api';

/**
 * Accès aux **options de commande** du référentiel (`/pim/option-groups`,
 * `plan-options-de-commande.md`, § 3.1). Le groupe s'écrit d'un bloc : la
 * liste des choix envoyée est celle des choix EN SERVICE, dans l'ordre — un
 * choix connu qui en est absent s'archive, un archivé qui y revient est
 * restauré.
 */
@Injectable({ providedIn: 'root' })
export class OptionGroupHttpApi {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  list(): Promise<OptionGroupView[]> {
    return firstValueFrom(this.http.get<OptionGroupView[]>(this.url('')));
  }

  /** Une fois par intention : un double clic n'ouvre pas deux groupes. */
  create(payload: OptionGroupPayload, intentKey: string): Promise<CreatedIdResponse> {
    return firstValueFrom(
      this.http.post<CreatedIdResponse>(this.url(''), payload, intentOptions(intentKey)),
    );
  }

  async update(id: string, payload: OptionGroupPayload): Promise<void> {
    await firstValueFrom(this.http.put(this.url(id), payload));
  }

  /** Le `DELETE` archive : un groupe ne se supprime pas. */
  async archive(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(id)));
  }

  async restore(id: string): Promise<void> {
    await firstValueFrom(this.http.post(this.url(`${id}/restore`), {}));
  }

  private url(path: string): string {
    return path === '' ? `${this.base}/option-groups` : `${this.base}/option-groups/${path}`;
  }
}

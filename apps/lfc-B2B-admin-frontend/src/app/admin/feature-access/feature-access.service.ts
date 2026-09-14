import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdminFeatureAccessView,
  FeatureExemptionPayload,
  FeatureOverridePayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

const BASE = `${B2B_API_BASE}/admin/feature-access`;

/**
 * **L'accès aux fonctionnalités**, côté staff (`/admin/feature-access`,
 * ressource `b2b_feature_access`).
 *
 * Chaque écriture **relit le tableau** et le rend : le serveur répond `204` ou
 * un simple identifiant (CQRS), et c'est lui qui sait ce que la valeur effective
 * et l'état des comptes sont devenus. L'écran ne recalcule jamais à sa place —
 * une exemption ajoutée ne sait pas d'elle-même si son adresse est vérifiée.
 *
 * Les clés passent dans l'URL encodées : elles viennent du serveur, mais une
 * ligne ignorée peut porter n'importe quoi.
 */
@Injectable({ providedIn: 'root' })
export class FeatureAccessService {
  private readonly http = inject(HttpClient);

  /** Le catalogue, la provenance de chaque valeur, les exemptions et les lignes ignorées. */
  async board(): Promise<AdminFeatureAccessView> {
    return firstValueFrom(this.http.get<AdminFeatureAccessView>(BASE));
  }

  /** Pose une dérogation. Le serveur confronte la valeur au catalogue. */
  async setOverride(key: string, value: string): Promise<AdminFeatureAccessView> {
    const payload: FeatureOverridePayload = { value };
    await firstValueFrom(this.http.put<void>(`${BASE}/${encodeURIComponent(key)}`, payload));
    return this.board();
  }

  /** Supprime la dérogation : la clé revient au défaut du code. */
  async clearOverride(key: string): Promise<AdminFeatureAccessView> {
    await firstValueFrom(this.http.delete<void>(`${BASE}/${encodeURIComponent(key)}`));
    return this.board();
  }

  /** Idempotent côté serveur : une adresse déjà exemptée ne se double pas. */
  async addExemption(key: string, email: string): Promise<AdminFeatureAccessView> {
    const payload: FeatureExemptionPayload = { email };
    await firstValueFrom(
      this.http.post<unknown>(`${BASE}/${encodeURIComponent(key)}/exemptions`, payload),
    );
    return this.board();
  }

  async removeExemption(key: string, id: string): Promise<AdminFeatureAccessView> {
    await firstValueFrom(
      this.http.delete<void>(
        `${BASE}/${encodeURIComponent(key)}/exemptions/${encodeURIComponent(id)}`,
      ),
    );
    return this.board();
  }
}

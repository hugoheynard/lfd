import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { MandateSectionView, RegisterMandatePayload } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Accès à la surface **mandat de prélèvement** du back-office.
 *
 * Auth : rien ici, comme pour les autres services admin — le jeton staff est
 * attaché par `staffAuthInterceptor`.
 *
 * **Aucune coordonnée bancaire ne passe par ce service.** L'IBAN va du
 * navigateur directement chez Stripe (iframe), et ce qui remonte au backend
 * n'est qu'un identifiant de moyen de paiement.
 */
@Injectable({ providedIn: 'root' })
export class MandatesService {
  private readonly http = inject(HttpClient);

  /** Le mandat courant + la clé publique Stripe, en une lecture. */
  async section(companyId: string): Promise<MandateSectionView> {
    return firstValueFrom(
      this.http.get<MandateSectionView>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate`),
    );
  }

  /** Enregistre le mandat à partir du moyen de paiement créé par l'IBAN Element. */
  async register(companyId: string, payload: RegisterMandatePayload): Promise<void> {
    await firstValueFrom(
      this.http.post<{ readonly id: string }>(
        `${B2B_API_BASE}/admin/companies/${companyId}/mandate`,
        payload,
      ),
    );
  }

  /** Dépose (ou remplace) le scan du mandat signé. */
  async uploadProof(companyId: string, file: File): Promise<void> {
    const body = new FormData();
    body.append('file', file);
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate/proof`, body),
    );
  }

  /** Retire l'autorisation de prélever. */
  async revoke(companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/companies/${companyId}/mandate`),
    );
  }
}

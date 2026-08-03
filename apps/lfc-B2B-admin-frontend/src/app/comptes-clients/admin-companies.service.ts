import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  BillingAddressPayload,
  DeliveryAddressPayload,
  UpdateIdentityPayload,
} from '@lfd/contracts';
import type { CompanyContactDraft, CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import { B2B_API_BASE } from '../api/api-config';
import { SuiteEmbed } from '../suite-embed/suite-embed';
import type { AdminCompany, AdminCompanyDetail, PaymentTerm } from './admin-company';

/** Audience du token staff demandé au shell (surface `/admin/*`). */
const STAFF_AUDIENCE = 'b2b-admin';

/**
 * Accès à la surface **admin** du backend B2B.
 *
 * Auth : on demande au shell un token pour l'audience staff (Invariant C — jamais
 * le token client). Embarqué en prod, le shell le relaie ; standalone ou en dev
 * (bypass backend), `requestToken` rend `null` → aucun en-tête, et le backend en
 * bypass laisse passer. Le jour où l'audience staff existe côté shell, la même
 * ligne fournit le vrai token.
 *
 * Les **mutations** (Porte B) complètent une société à la place du client — elles
 * n'ont pas de mur membership côté backend (le staff n'est membre de rien), la
 * porte est l'auth staff. Le service ne fait que le transport ; la fiche
 * (container) enchaîne rechargement + toast.
 */
@Injectable({ providedIn: 'root' })
export class AdminCompaniesService {
  private readonly http = inject(HttpClient);
  private readonly embed = inject(SuiteEmbed);

  async list(): Promise<readonly AdminCompany[]> {
    return firstValueFrom(
      this.http.get<readonly AdminCompany[]>(`${B2B_API_BASE}/admin/companies`, {
        headers: await this.authHeaders(),
      }),
    );
  }

  /** La **fiche** d'une société (état d'activation complet). `undefined` si l'id est inconnu (404). */
  async getById(id: string): Promise<AdminCompanyDetail | undefined> {
    try {
      return await firstValueFrom(
        this.http.get<AdminCompanyDetail>(`${B2B_API_BASE}/admin/companies/${id}`, {
          headers: await this.authHeaders(),
        }),
      );
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Crée un compte client (identité + contact principal). Le staff saisit tout :
   * il n'y a pas de profil créateur d'où dériver le contact, contrairement au
   * self-signup client.
   */
  async create(input: {
    readonly identity: CompanyIdentityDraft;
    readonly contact: CompanyContactDraft;
  }): Promise<AdminCompany> {
    const body = { ...input.identity, primaryContact: input.contact };
    return firstValueFrom(
      this.http.post<AdminCompany>(`${B2B_API_BASE}/admin/companies`, body, {
        headers: await this.authHeaders(),
      }),
    );
  }

  /** Dépose (ou remplace) le KBIS — multipart. */
  async uploadKbis(companyId: string, file: File): Promise<void> {
    const body = new FormData();
    body.append('file', file);
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/companies/${companyId}/kbis`, body, {
        headers: await this.authHeaders(),
      }),
    );
  }

  /** Édite l'identité souple (enseigne + n° de TVA). */
  async updateIdentity(companyId: string, payload: UpdateIdentityPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/companies/${companyId}/identity`, payload, {
        headers: await this.authHeaders(),
      }),
    );
  }

  /** Fixe la condition de règlement **convenue** (solde la demande client). */
  async setPaymentTerm(companyId: string, paymentTerm: PaymentTerm): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/payment-term`,
        { paymentTerm },
        { headers: await this.authHeaders() },
      ),
    );
  }

  /** Enregistre l'unique adresse de facturation. */
  async saveBilling(companyId: string, payload: BillingAddressPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/billing-address`,
        payload,
        { headers: await this.authHeaders() },
      ),
    );
  }

  /** Active le compte (`pending → active`). Le gate (pièces requises) est serveur. */
  async activate(companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/companies/${companyId}/activate`, null, {
        headers: await this.authHeaders(),
      }),
    );
  }

  /** Ajoute une adresse de livraison. */
  async addDelivery(companyId: string, payload: DeliveryAddressPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<{ readonly id: string }>(
        `${B2B_API_BASE}/admin/companies/${companyId}/delivery-addresses`,
        payload,
        { headers: await this.authHeaders() },
      ),
    );
  }

  /** En-tête `Authorization` staff, ou vide en dev/standalone (bypass backend). */
  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.embed.requestToken(STAFF_AUDIENCE);
    return token === null ? {} : { Authorization: `Bearer ${token}` };
  }
}

/** Vrai si l'erreur HTTP est un 404 (société inconnue). */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}

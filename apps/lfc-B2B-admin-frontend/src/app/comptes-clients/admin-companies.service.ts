import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  BillingAddressPayload,
  CompanyMemberInvitedView,
  CompanyMemberView,
  CustomerLookupView,
  CustomerSearchView,
  DeliveryAddressPayload,
  InviteCompanyMemberPayload,
  UpdateIdentityPayload,
} from '@lfd/contracts';
import type { CompanyContactDraft, CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import { B2B_API_BASE } from '../api/api-config';
import type { AdminCompany, AdminCompanyDetail, CompanyOpened, PaymentTerm } from './admin-company';

/**
 * Accès à la surface **admin** du backend B2B.
 *
 * Auth : rien ici. Le jeton staff (Invariant C — jamais le token client) est
 * attaché par `staffAuthInterceptor`, qui sait seul d'où il vient : du shell
 * quand l'app est embarquée, de sa propre session Auth0 sinon.
 *
 * Les **mutations** (Porte B) complètent une société à la place du client — elles
 * n'ont pas de mur membership côté backend (le staff n'est membre de rien), la
 * porte est l'auth staff. Le service ne fait que le transport ; la fiche
 * (container) enchaîne rechargement + toast.
 */
@Injectable({ providedIn: 'root' })
export class AdminCompaniesService {
  private readonly http = inject(HttpClient);

  async list(): Promise<readonly AdminCompany[]> {
    return firstValueFrom(
      this.http.get<readonly AdminCompany[]>(`${B2B_API_BASE}/admin/companies`),
    );
  }

  /** La **fiche** d'une société (état d'activation complet). `undefined` si l'id est inconnu (404). */
  async getById(id: string): Promise<AdminCompanyDetail | undefined> {
    try {
      return await firstValueFrom(
        this.http.get<AdminCompanyDetail>(`${B2B_API_BASE}/admin/companies/${id}`),
      );
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Ouvre un compte client (identité + **détenteur**). Le staff saisit tout : il
   * n'y a pas de profil créateur d'où dériver le contact, contrairement au
   * self-signup client.
   *
   * La réponse dit ce qui est arrivé à l'**accès** — le serveur seul le sait :
   * l'adresse appartenait-elle déjà à un client, et l'e-mail est-il parti.
   */
  async create(input: {
    readonly identity: CompanyIdentityDraft;
    readonly contact: CompanyContactDraft;
  }): Promise<CompanyOpened> {
    const body = { ...input.identity, primaryContact: input.contact };
    return firstValueFrom(this.http.post<CompanyOpened>(`${B2B_API_BASE}/admin/companies`, body));
  }

  /**
   * Les clients dont le nom ou l'adresse **contient** le terme cherché.
   *
   * Chercher plutôt que saisir : le commercial connaît le nom de son
   * interlocuteur, rarement l'orthographe de son adresse — et c'est ce qui lui
   * permet de rattacher la société à un espace existant.
   */
  async searchCustomers(term: string): Promise<CustomerSearchView> {
    return firstValueFrom(
      this.http.get<CustomerSearchView>(`${B2B_API_BASE}/admin/customers`, {
        params: { q: term },
      }),
    );
  }

  /**
   * Ce qu'on sait déjà de la personne portant cette adresse, `null` si elle nous
   * est inconnue — le cas le plus fréquent, et pas une erreur.
   *
   * Se lit **avant** d'enregistrer : un même client peut détenir plusieurs
   * établissements, et le commercial doit s'en apercevoir pendant qu'il a encore
   * le client au téléphone, pas après lui avoir ouvert un second espace.
   */
  async findCustomerByEmail(email: string): Promise<CustomerLookupView | null> {
    return firstValueFrom(
      this.http.get<CustomerLookupView | null>(`${B2B_API_BASE}/admin/customers/by-email`, {
        params: { email },
      }),
    );
  }

  /** Les personnes qui **accèdent** à l'espace de cette société. */
  async listMembers(companyId: string): Promise<readonly CompanyMemberView[]> {
    return firstValueFrom(
      this.http.get<readonly CompanyMemberView[]>(
        `${B2B_API_BASE}/admin/companies/${companyId}/members`,
      ),
    );
  }

  /**
   * Ouvre un accès — au détenteur, ou à un collègue.
   *
   * **Idempotent sur l'adresse** : ré-inviter quelqu'un ne crée pas de doublon,
   * ça lui renvoie un lien. C'est ce qui fait que « Renvoyer le lien » et
   * « Inviter » sont le même appel.
   */
  async inviteMember(
    companyId: string,
    payload: InviteCompanyMemberPayload,
  ): Promise<CompanyMemberInvitedView> {
    return firstValueFrom(
      this.http.post<CompanyMemberInvitedView>(
        `${B2B_API_BASE}/admin/companies/${companyId}/members`,
        payload,
      ),
    );
  }

  /** Édite le **détenteur** du compte (contact principal, aplati sur la société). */
  async updatePrimaryContact(companyId: string, payload: CompanyContactDraft): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/companies/${companyId}/contact`, payload),
    );
  }

  /** Ajoute un interlocuteur additionnel au carnet d'adresses. */
  async addContact(companyId: string, payload: CompanyContactDraft): Promise<void> {
    await firstValueFrom(
      this.http.post<{ readonly id: string }>(
        `${B2B_API_BASE}/admin/companies/${companyId}/contacts`,
        payload,
      ),
    );
  }

  /** Remplace un interlocuteur additionnel. */
  async updateContact(
    companyId: string,
    contactId: string,
    payload: CompanyContactDraft,
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/contacts/${contactId}`,
        payload,
      ),
    );
  }

  /** Retire un interlocuteur additionnel. */
  async removeContact(companyId: string, contactId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/companies/${companyId}/contacts/${contactId}`),
    );
  }

  /** Dépose (ou remplace) le KBIS — multipart. */
  async uploadKbis(companyId: string, file: File): Promise<void> {
    const body = new FormData();
    body.append('file', file);
    await firstValueFrom(
      this.http.put<void>(`${B2B_API_BASE}/admin/companies/${companyId}/kbis`, body),
    );
  }

  /** Édite l'identité souple (enseigne + n° de TVA). */
  async updateIdentity(companyId: string, payload: UpdateIdentityPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/companies/${companyId}/identity`, payload),
    );
  }

  /** Fixe la condition de règlement **convenue** (solde la demande client). */
  async setPaymentTerm(companyId: string, paymentTerm: PaymentTerm): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/companies/${companyId}/payment-term`, {
        paymentTerm,
      }),
    );
  }

  /** Enregistre l'unique adresse de facturation. */
  async saveBilling(companyId: string, payload: BillingAddressPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/billing-address`,
        payload,
      ),
    );
  }

  /** Active le compte (`pending → active`). Le gate (pièces requises) est serveur. */
  async activate(companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/companies/${companyId}/activate`, null),
    );
  }

  /** Ajoute une adresse de livraison. */
  async addDelivery(companyId: string, payload: DeliveryAddressPayload): Promise<void> {
    await firstValueFrom(
      this.http.post<{ readonly id: string }>(
        `${B2B_API_BASE}/admin/companies/${companyId}/delivery-addresses`,
        payload,
      ),
    );
  }
}

/** Vrai si l'erreur HTTP est un 404 (société inconnue). */
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}

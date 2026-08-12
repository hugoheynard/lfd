import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AccountHolderPayload,
  BillingAddressPayload,
  FulfillmentPreferencePayload,
  DeferredTerm,
  CompanyMemberInvitedView,
  CompanyMemberView,
  DeliveryAddressPayload,
  InviteCompanyMemberPayload,
  UpdateIdentityPayload,
} from '@lfd/contracts';
import type { CompanyContactDraft, CompanyIdentityDraft } from '@lfd/b2b-ui/company';

import { B2B_API_BASE } from '../api/api-config';
import type {
  AdminCompany,
  AdminCompanyDetail,
  CompanyOpened,
  HolderAttached,
} from './admin-company';

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
   * Ouvre un compte client : son identité, et son **détenteur s'il est déjà
   * connu**. Le staff saisit tout — il n'y a pas de profil créateur d'où dériver
   * le contact, contrairement au self-signup client.
   *
   * `contact` absent ouvre le compte sur sa seule enseigne : le commercial a le
   * client au téléphone et n'a pas encore l'adresse du gérant. Le détenteur se
   * rattache ensuite par {@link attachHolder}.
   *
   * La réponse dit ce qui est arrivé à l'**accès** — le serveur seul le sait :
   * l'adresse appartenait-elle déjà à un client, et l'e-mail est-il parti.
   */
  async create(input: {
    readonly identity: CompanyIdentityDraft;
    readonly contact?: CompanyContactDraft | undefined;
  }): Promise<CompanyOpened> {
    const body = { ...input.identity, primaryContact: input.contact };
    return firstValueFrom(this.http.post<CompanyOpened>(`${B2B_API_BASE}/admin/companies`, body));
  }

  /**
   * Rattache le **détenteur** d'un compte ouvert sans lui.
   *
   * Distinct d'`inviteMember` : celui-ci ouvre un accès à quelqu'un de plus,
   * celui-là **désigne** la personne du compte. Le serveur reconnaît l'adresse
   * si elle a déjà un espace chez nous, et la société vient l'y rejoindre.
   */
  async attachHolder(companyId: string, payload: AccountHolderPayload): Promise<HolderAttached> {
    return firstValueFrom(
      this.http.post<HolderAttached>(
        `${B2B_API_BASE}/admin/companies/${companyId}/holder`,
        payload,
      ),
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

  /**
   * Récupère l'extrait en **blob** — l'endpoint est authentifié, un `<a href>`
   * ne porterait pas le jeton. L'appelant décide de l'ouvrir ou de l'enregistrer.
   */
  fetchKbis(companyId: string): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${B2B_API_BASE}/admin/companies/${companyId}/kbis`, {
        responseType: 'blob',
      }),
    );
  }

  /**
   * **Certifie** le KBIS : un agent a ouvert l'extrait et l'a confronté à
   * l'identité enregistrée. C'est ce geste qui débloque l'activation — le dépôt
   * seul ne prouve rien. Le serveur refuse (404) s'il n'y a rien à certifier, et
   * garde qui a certifié.
   */
  async certifyKbis(companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(`${B2B_API_BASE}/admin/companies/${companyId}/kbis/certification`, {}),
    );
  }

  /** Retire la certification — un clic de trop doit pouvoir se défaire. */
  async revokeKbisCertification(companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${B2B_API_BASE}/admin/companies/${companyId}/kbis/certification`),
    );
  }

  /**
   * Corrige une adresse de livraison **déjà posée**.
   *
   * Sans elle, le staff ne pouvait qu'en *ajouter* une : un code d'accès changé
   * se réglait en créant un doublon, ou en attendant que le client s'en occupe.
   */
  async updateDelivery(
    companyId: string,
    addressId: string,
    payload: DeliveryAddressPayload,
  ): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/delivery-addresses/${addressId}`,
        payload,
      ),
    );
  }

  /** Désigne l'adresse de livraison par défaut. */
  async setDefaultDelivery(companyId: string, addressId: string): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/delivery-addresses/${addressId}/default`,
        {},
      ),
    );
  }

  /** Archive une adresse de livraison — jamais de suppression physique. */
  async removeDelivery(companyId: string, addressId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/delivery-addresses/${addressId}`,
      ),
    );
  }

  /**
   * Pose la **préférence d'acheminement**. Elle ne conditionne rien : c'est un
   * défaut offert au panier, que le client peut écarter.
   */
  async preferFulfillment(companyId: string, payload: FulfillmentPreferencePayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(
        `${B2B_API_BASE}/admin/companies/${companyId}/fulfillment-preference`,
        payload,
      ),
    );
  }

  /** Édite l'identité souple (enseigne + n° de TVA). */
  async updateIdentity(companyId: string, payload: UpdateIdentityPayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/companies/${companyId}/identity`, payload),
    );
  }

  /** Fixe la condition de règlement **convenue** (solde la demande client). */
  async grantTerms(companyId: string, grantedTerms: readonly DeferredTerm[]): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/companies/${companyId}/granted-terms`, {
        grantedTerms,
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

  /**
   * **Réactive** un compte suspendu. Réservé à la suspension décidée par un
   * humain : celle qu'a provoquée le retrait de vérification du KBIS se lève
   * toute seule à la re-vérification, sans passer par ici.
   */
  async reactivate(companyId: string): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/companies/${companyId}/status`, {
        action: 'reactivate',
        reason: '',
      }),
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

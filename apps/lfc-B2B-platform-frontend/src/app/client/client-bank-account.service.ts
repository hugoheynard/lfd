import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  CustomerBankAccountSectionView,
  CustomerBankAccountView,
  SetCompanyBankAccountPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Où en est la lecture du RIB. */
export type BankReadStatus = 'loading' | 'failed' | 'ready';

/**
 * **Le RIB de la société**, tel que le client le voit et le dépose sur
 * `/mon-compte` (plan `documentation/b2b/plan-rib-client.md`, lot B).
 *
 * Deux gestes, et pas un de plus : lire, écrire. Il garde **une** lecture,
 * parce que deux cartes la montrent en même temps — la carte bureau et la
 * carte mobile sont toutes deux dans le DOM, le CSS n'en affiche qu'une — et
 * qu'elles ne doivent pas lire le RIB deux fois.
 *
 * 🔴 L'IBAN **monte en clair et ne redescend jamais** : la lecture n'en rend
 * que `last4`. Le mur (rôle `owner` ou `billing`, 404 hors société) est tenu
 * par l'API ; l'écran ne fait que ne pas proposer la carte aux autres rôles.
 */
@Injectable({ providedIn: 'root' })
export class ClientBankAccount {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly _status = signal<BankReadStatus>('loading');
  private readonly _account = signal<CustomerBankAccountView | null>(null);
  private readFor: string | null = null;

  readonly status = this._status.asReadonly();
  readonly account = this._account.asReadonly();

  /**
   * Lit le RIB de la société si ce n'est pas déjà fait. Appelé par chaque
   * carte : la seconde ne relit pas. Paresseux plutôt qu'automatique, parce
   * que seuls `owner` et `billing` voient ces cartes — les autres rôles ne
   * doivent pas déclencher une lecture que l'API leur refuserait.
   */
  ensure(companyId: string): void {
    if (this.readFor !== companyId) {
      void this.reload(companyId);
    }
  }

  /** Relit : après un échec (« Réessayer »), ou après un enregistrement. */
  async reload(companyId: string): Promise<void> {
    this.readFor = companyId;
    if (this._status() === 'failed') {
      this._status.set('loading');
    }
    try {
      const { account } = await this.read(companyId);
      this._account.set(account);
      this._status.set('ready');
    } catch {
      this._status.set('failed');
    }
  }

  /** `GET /companies/:companyId/bank-account` — `{ account: null }` sans RIB déposé. */
  async read(companyId: string): Promise<CustomerBankAccountSectionView> {
    return firstValueFrom(
      this.http.get<CustomerBankAccountSectionView>(this.url(companyId), {
        headers: await this.headers(),
      }),
    );
  }

  /**
   * `PUT` du compte entier (204) : l'appelant relit ensuite, la réponse ne porte
   * rien.
   *
   * Rend `null` au succès et le **message du serveur** au refus, plutôt que de
   * rejeter : un IBAN refusé se corrige dans le panneau resté ouvert, sous les
   * yeux de qui l'a saisi (même contrat que `AccountService.saveIdentity`).
   */
  async save(companyId: string, payload: SetCompanyBankAccountPayload): Promise<string | null> {
    try {
      await firstValueFrom(
        this.http.put(this.url(companyId), payload, { headers: await this.headers() }),
      );
      return null;
    } catch (error) {
      return httpErrorMessage(error);
    }
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/bank-account`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

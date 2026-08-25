import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import type {
  BillingAddressPayload,
  CompanyAddressesView,
  DeliveryAddressPayload,
} from '@lfd/contracts';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';

/** Où en est le chargement des adresses d'une entreprise. */
export type AddressesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Adresses **par entreprise**, branchées sur la vraie API (`/companies/:id/
 * addresses`). Une seule entreprise à l'écran : l'état porte la vue de la
 * dernière chargée. Chaque écriture recharge cette entreprise.
 *
 * Comme `AccountService` : un **chargement** raté est un état de page (`error`) ;
 * une **opération** ratée est un toast, un succès aussi.
 */
@Injectable({ providedIn: 'root' })
export class AddressesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly notify = inject(NotifyService);

  private readonly loadedCompanyId = signal<string | null>(null);
  private readonly _view = signal<CompanyAddressesView | null>(null);
  private readonly _status = signal<AddressesStatus>('idle');
  private readonly _error = signal<string | null>(null);

  readonly view = this._view.asReadonly();
  readonly status = this._status.asReadonly();
  /** Message d'un échec de **chargement** (état de page) ; `null` sinon. */
  readonly error = this._error.asReadonly();

  /** (Re)charge les adresses d'une entreprise si elle n'est pas déjà à l'écran. */
  loadFor(companyId: string): void {
    if (this.loadedCompanyId() === companyId && this._status() === 'ready') {
      return;
    }
    this.reload(companyId);
  }

  // ─── Écritures pilotées par un PANNEAU (`ADDRESS_WRITER`) ──────────────────
  // Elles rendent une promesse et n'annoncent rien : c'est `panelSubmit()` qui
  // annonce et qui ferme. Les annoncer ici AUSSI donnerait deux toasts pour un
  // seul geste.

  saveBilling(companyId: string, payload: BillingAddressPayload): Promise<void> {
    return this.write(companyId, (token) =>
      this.http.patch(
        `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/billing-address`,
        payload,
        headers(token),
      ),
    );
  }

  addDelivery(companyId: string, payload: DeliveryAddressPayload): Promise<void> {
    return this.write(companyId, (token) =>
      this.http.post(
        `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/delivery-addresses`,
        payload,
        headers(token),
      ),
    );
  }

  updateDelivery(
    companyId: string,
    addressId: string,
    payload: DeliveryAddressPayload,
  ): Promise<void> {
    return this.write(companyId, (token) =>
      this.http.patch(
        `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/delivery-addresses/${addressId}`,
        payload,
        headers(token),
      ),
    );
  }

  removeDelivery(companyId: string, addressId: string, onDone?: () => void): void {
    this.mutate(
      companyId,
      (token) =>
        this.http.delete(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/delivery-addresses/${addressId}`,
          headers(token),
        ),
      'Adresse de livraison supprimée.',
      onDone,
    );
  }

  setDefaultDelivery(companyId: string, addressId: string, onDone?: () => void): void {
    this.mutate(
      companyId,
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/delivery-addresses/${addressId}/default`,
          {},
          headers(token),
        ),
      'Adresse par défaut mise à jour.',
      onDone,
    );
  }

  /**
   * Écrit, puis recharge l'entreprise visée. **Rejette** en cas d'échec :
   * l'appelant (le panneau) décide quoi en dire et s'il reste ouvert.
   */
  private async write(
    companyId: string,
    call: (token: string) => Observable<unknown>,
  ): Promise<void> {
    this._status.set('loading');
    try {
      await firstValueFrom(this.auth.accessToken$().pipe(switchMap(call)));
    } catch (error) {
      this._status.set('ready');
      throw error;
    }
    this.reload(companyId);
  }

  /** GET des adresses → état. Un échec est un **état de page**. */
  private reload(companyId: string): void {
    this._status.set('loading');
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<CompanyAddressesView>(
            `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/addresses`,
            headers(token),
          ),
        ),
      )
      .subscribe({
        next: (view) => {
          this.loadedCompanyId.set(companyId);
          this._view.set(view);
          this._status.set('ready');
          this._error.set(null);
        },
        error: (error: unknown) => {
          this._status.set('error');
          this._error.set(httpErrorMessage(error));
        },
      });
  }

  /** Écrit puis recharge l'entreprise visée. Succès → toast ; échec → toast. */
  private mutate(
    companyId: string,
    call: (token: string) => Observable<unknown>,
    success: string,
    onDone?: () => void,
  ): void {
    this._status.set('loading');
    this.auth
      .accessToken$()
      .pipe(switchMap(call))
      .subscribe({
        next: () => {
          this.reload(companyId);
          this.notify.success(success);
          onDone?.();
        },
        error: (error: unknown) => {
          this._status.set('ready');
          this.notify.error(error);
        },
      });
  }
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

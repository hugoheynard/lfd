import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type {
  BillingAddressPayload,
  CompanyAddressesView,
  DeliveryAddressPayload,
} from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/** Où en est le chargement des adresses d'une entreprise. */
export type AddressesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Adresses **par entreprise**, branchées sur la vraie API (`/companies/:id/
 * addresses`). Remplace le `ProfilService` démo (singleton, commun à toutes les
 * entreprises) pour la fiche entreprise.
 *
 * Une seule entreprise est affichée à la fois : l'état porte la vue de la
 * **dernière chargée** et l'id correspondant. Chaque écriture recharge cette
 * entreprise — la page n'a jamais à recomposer localement ce que le backend
 * vient de normaliser (défaut, tri, archivage).
 */
@Injectable({ providedIn: 'root' })
export class AddressesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly loadedCompanyId = signal<string | null>(null);
  private readonly _view = signal<CompanyAddressesView | null>(null);
  private readonly _status = signal<AddressesStatus>('idle');
  private readonly _error = signal<string | null>(null);

  readonly view = this._view.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();

  /** (Re)charge les adresses d'une entreprise si elle n'est pas déjà à l'écran. */
  loadFor(companyId: string): void {
    if (this.loadedCompanyId() === companyId && this._status() === 'ready') {
      return;
    }
    this.reload(companyId);
  }

  saveBilling(companyId: string, payload: BillingAddressPayload, onDone?: () => void): void {
    this.mutate(
      companyId,
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/billing-address`,
          payload,
          headers(token),
        ),
      onDone,
    );
  }

  addDelivery(companyId: string, payload: DeliveryAddressPayload, onDone?: () => void): void {
    this.mutate(
      companyId,
      (token) =>
        this.http.post(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/delivery-addresses`,
          payload,
          headers(token),
        ),
      onDone,
    );
  }

  updateDelivery(
    companyId: string,
    addressId: string,
    payload: DeliveryAddressPayload,
    onDone?: () => void,
  ): void {
    this.mutate(
      companyId,
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/delivery-addresses/${addressId}`,
          payload,
          headers(token),
        ),
      onDone,
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
      onDone,
    );
  }

  /** GET des adresses → état. */
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
        error: (error: unknown) => this.fail(error),
      });
  }

  /** Écrit puis recharge l'entreprise visée. */
  private mutate(
    companyId: string,
    call: (token: string) => Observable<unknown>,
    onDone?: () => void,
  ): void {
    this._status.set('loading');
    this.auth
      .accessToken$()
      .pipe(switchMap(call))
      .subscribe({
        next: () => {
          this.reload(companyId);
          onDone?.();
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  private fail(error: unknown): void {
    this._status.set('error');
    this._error.set(readErrorMessage(error));
  }
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/** Message backend s'il est lisible (erreur métier rédigée), sinon générique. */
function readErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const body = (error as { error: unknown }).error;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message !== '') {
        return message;
      }
    }
  }
  return 'Une erreur est survenue sur les adresses. Réessayez.';
}

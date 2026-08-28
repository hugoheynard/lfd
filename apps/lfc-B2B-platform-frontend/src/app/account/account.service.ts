import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { FulfillmentPreferenceView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import type { CatalogueView } from '../legacy/catalogue/catalogue-view';
import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import type {
  Account,
  CompanyDraft,
  ContactDraft,
  NavPreferences,
  SettlementMean,
  UserProfileDraft,
} from './account.model';

/** Où en est le chargement du compte — l'app doit distinguer « vide » de « pas encore su ». */
export type AccountStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Source de vérité du **compte** côté front : le profil de la personne et ses
 * entreprises, tels que le backend les tranche (`GET /me`).
 *
 * Deux natures d'échec, traitées différemment :
 * - le **chargement** (`load`) qui rate est un état de **page** (`error` +
 *   `status`) — la fiche affiche « impossible de charger », pas un toast fugace ;
 * - une **opération** (écriture) qui rate est un **toast** d'erreur (message sûr
 *   de l'enveloppe), et un succès un toast de confirmation. Le compte reste
 *   chargé : une écriture ratée ne bascule pas la page en erreur.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly notify = inject(NotifyService);

  private readonly state = signal<Account | null>(null);
  private readonly _status = signal<AccountStatus>('idle');
  private readonly _error = signal<string | null>(null);

  readonly account = this.state.asReadonly();
  readonly status = this._status.asReadonly();
  /** Message d'un échec de **chargement** (état de page) ; `null` sinon. */
  readonly error = this._error.asReadonly();

  readonly profile = computed(() => this.state()?.profile ?? null);
  readonly companies = computed(() => this.state()?.companies ?? []);

  /** Préférences d'affichage persistées ; défaut « aucun choix » avant chargement. */
  readonly navPrefs = computed<NavPreferences>(
    () => this.state()?.navPrefs ?? { catalogueView: null },
  );

  /**
   * Vrai quand on **sait** que la personne n'a aucune entreprise — pas quand on
   * l'ignore encore. Sans cette distinction, l'empty state « Créer une
   * entreprise » clignoterait à chaque chargement, avant la réponse.
   */
  readonly hasNoCompany = computed(
    () => this._status() === 'ready' && this.companies().length === 0,
  );

  /** E-mail affiché par l'app : le nôtre s'il est connu, celui d'Auth0 en repli. */
  readonly displayEmail = computed(() => this.profile()?.email ?? this.auth.authEmail());

  constructor() {
    // Dès qu'Auth0 confirme l'authentification, on résout l'identité *chez nous*.
    effect(() => {
      if (this.auth.isAuthenticated() && this._status() === 'idle') {
        this.load();
      }
    });
  }

  /** (Re)charge le compte. Un échec est un **état de page** (pas un toast). */
  load(): void {
    this._status.set('loading');
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<Account>(`${AUTH_CONFIG.apiBaseUrl}/me`, headers(token)),
        ),
      )
      .subscribe({
        next: (account) => this.ready(account),
        error: (error: unknown) => {
          this._status.set('error');
          this._error.set(httpErrorMessage(error));
        },
      });
  }

  /** Enregistre le profil (opération → toast) ; l'état est remplacé par le compte relu. */
  saveProfile(draft: UserProfileDraft): void {
    this._status.set('loading');
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.patch<Account>(`${AUTH_CONFIG.apiBaseUrl}/me/profile`, draft, headers(token)),
        ),
      )
      .subscribe({
        next: (account) => {
          this.ready(account);
          this.notify.success('Profil enregistré.');
        },
        error: (error: unknown) => this.failOperation(error),
      });
  }

  /**
   * Persiste la vue de catalogue choisie — **optimiste et silencieuse** : on
   * reflète le choix tout de suite (l'UI ne doit pas attendre le réseau pour une
   * préférence d'affichage), on écrit en arrière-plan sans toast de succès. En
   * cas d'échec on **revient** à l'état précédent et on toaste l'erreur.
   *
   * No-op si le compte n'est pas encore chargé ou si la vue ne change pas — évite
   * un PATCH inutile à chaque rendu.
   */
  setCatalogueView(view: CatalogueView): void {
    const current = this.state();
    if (current === null || current.navPrefs.catalogueView === view) {
      return;
    }
    this.state.set({ ...current, navPrefs: { ...current.navPrefs, catalogueView: view } });
    this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.patch<Account>(
            `${AUTH_CONFIG.apiBaseUrl}/me/nav-prefs`,
            { catalogueView: view },
            headers(token),
          ),
        ),
      )
      .subscribe({
        next: (account) => this.state.set(account),
        error: (error: unknown) => {
          this.state.set(current);
          this.notify.error(error);
        },
      });
  }

  createCompany(draft: CompanyDraft, onDone?: () => void): void {
    this.mutate(
      (token) => this.http.post(`${AUTH_CONFIG.apiBaseUrl}/companies`, draft, headers(token)),
      'Entreprise créée.',
      onDone,
    );
  }

  updateIdentity(
    companyId: string,
    identity: { enseigne: string; vatNumber: string },
    onDone?: () => void,
  ): void {
    this.mutate(
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/identity`,
          identity,
          headers(token),
        ),
      'Identité mise à jour.',
      onDone,
    );
  }

  requestSettlementMean(companyId: string, paymentTerm: SettlementMean, onDone?: () => void): void {
    this.mutate(
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/payment-term`,
          { paymentTerm },
          headers(token),
        ),
      'Demande de règlement enregistrée.',
      onDone,
    );
  }

  /**
   * Pose (ou retire) la **préférence d'acheminement** de sa société.
   *
   * Contrairement au délai de règlement, ce n'est pas une demande adressée au
   * commercial : c'est le client qui sait où il veut être servi.
   */
  preferFulfillment(companyId: string, preference: FulfillmentPreferenceView): Promise<boolean> {
    return this.write(
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/fulfillment-preference`,
          preference,
          headers(token),
        ),
      "Préférence d'acheminement enregistrée.",
    );
  }

  updatePrimaryContact(companyId: string, draft: ContactDraft, onDone?: () => void): void {
    this.mutate(
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contact`,
          draft,
          headers(token),
        ),
      'Contact enregistré.',
      onDone,
    );
  }

  addContact(companyId: string, draft: ContactDraft, onDone?: () => void): void {
    this.mutate(
      (token) =>
        this.http.post(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts`,
          draft,
          headers(token),
        ),
      'Contact ajouté.',
      onDone,
    );
  }

  updateContact(
    companyId: string,
    contactId: string,
    draft: ContactDraft,
    onDone?: () => void,
  ): void {
    this.mutate(
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts/${contactId}`,
          draft,
          headers(token),
        ),
      'Contact enregistré.',
      onDone,
    );
  }

  removeContact(companyId: string, contactId: string, onDone?: () => void): void {
    this.mutate(
      (token) =>
        this.http.delete(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts/${contactId}`,
          headers(token),
        ),
      'Contact supprimé.',
      onDone,
    );
  }

  uploadKbis(companyId: string, file: File, onDone?: () => void): void {
    const form = new FormData();
    form.append('file', file, file.name);
    this.mutate(
      (token) =>
        this.http.put(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/kbis`,
          form,
          headers(token),
        ),
      'KBIS déposé.',
      onDone,
    );
  }

  /**
   * Récupère le KBIS en **blob** (l'endpoint est authentifié : un `<a href>` ne
   * pourrait pas porter le jeton). L'appelant décide de l'ouvrir ou de le
   * télécharger.
   */
  fetchKbis(companyId: string): Observable<Blob> {
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get(`${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/kbis`, {
          ...headers(token),
          responseType: 'blob',
        }),
      ),
    );
  }

  /** Range le compte relu dans l'état et efface l'erreur de page. */
  private ready(account: Account): void {
    this.state.set(account);
    this._status.set('ready');
    this._error.set(null);
  }

  /**
   * Exécute une écriture puis **recharge** le compte. Succès → toast ; échec →
   * toast d'erreur (le compte reste chargé). `onDone` ne se déclenche qu'au
   * succès — l'appelant ne referme son panneau que si l'écriture a abouti.
   */
  private mutate(
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
          this.load();
          this.notify.success(success);
          onDone?.();
        },
        error: (error: unknown) => this.failOperation(error),
      });
  }

  /**
   * Comme {@link mutate}, mais la promesse **retombe dans les deux cas**.
   *
   * `onDone` ne se déclenche qu'au succès — c'est ce qu'il faut pour fermer un
   * panneau, et c'est précisément ce qu'il ne faut pas pour désarmer un écran :
   * un échec le laisserait gelé. Ce que rend la promesse ne sert donc pas à
   * annoncer (le toast reste ici), mais à savoir que le vol est terminé.
   */
  private write(call: (token: string) => Observable<unknown>, success: string): Promise<boolean> {
    this._status.set('loading');
    return firstValueFrom(this.auth.accessToken$().pipe(switchMap(call))).then(
      () => {
        this.load();
        this.notify.success(success);
        return true;
      },
      (error: unknown) => {
        this.failOperation(error);
        return false;
      },
    );
  }

  /** Échec d'une **opération** : on toaste, sans basculer la page en erreur. */
  private failOperation(error: unknown): void {
    this._status.set('ready');
    this.notify.error(error);
  }
}

function headers(token: string): { headers: Record<string, string> } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

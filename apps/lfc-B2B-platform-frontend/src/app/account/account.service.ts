import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import type { Account, CompanyDraft, ContactDraft, UserProfileDraft } from './account.model';

/** Où en est le chargement du compte — l'app doit distinguer « vide » de « pas encore su ». */
export type AccountStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Source de vérité du **compte** côté front : le profil de la personne et ses
 * entreprises, tels que le backend les tranche (`GET /me`).
 *
 * C'est ce service — et non `AuthFacade` — qui détient notre identité. La façade
 * ne répond que d'Auth0 (« ce porteur a prouvé ce `sub` ») ; ici on porte ce que
 * **notre base** décide. Ce partage évite de faire d'`AuthFacade` un fourre-tout,
 * et rend la dépendance à sens unique : ce service connaît la façade, jamais
 * l'inverse.
 *
 * Toutes les écritures renvoient le compte relu par le backend, qu'on réinjecte
 * dans l'état : la page n'a jamais à recomposer localement ce qu'elle vient
 * d'envoyer, ni à deviner ce que le domaine a normalisé (SIRET, casse d'e-mail,
 * espaces).
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly state = signal<Account | null>(null);
  private readonly _status = signal<AccountStatus>('idle');
  private readonly _error = signal<string | null>(null);

  readonly account = this.state.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();

  readonly profile = computed(() => this.state()?.profile ?? null);
  readonly companies = computed(() => this.state()?.companies ?? []);

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
    // Le jeton ne dit que le `sub` ; le profil et les entreprises viennent de la
    // base. C'est le contrat DB-autoritaire, vu du front.
    effect(() => {
      if (this.auth.isAuthenticated() && this._status() === 'idle') {
        this.load();
      }
    });
  }

  /** (Re)charge le compte. */
  load(): void {
    this._status.set('loading');
    this.request((token) => this.http.get<Account>(`${AUTH_CONFIG.apiBaseUrl}/me`, headers(token)));
  }

  /** Enregistre le profil ; l'état est remplacé par le compte relu. */
  saveProfile(draft: UserProfileDraft): void {
    this._status.set('loading');
    this.request((token) =>
      this.http.patch<Account>(`${AUTH_CONFIG.apiBaseUrl}/me/profile`, draft, headers(token)),
    );
  }

  /**
   * Déclare une entreprise, puis **recharge** le compte.
   *
   * La création ne renvoie qu'un identifiant (une commande ne produit pas de
   * modèle de lecture) : on relit donc `/me` pour obtenir l'entreprise telle que
   * le backend l'a enregistrée — statut `pending` et SIRET normalisé compris.
   *
   * @param onDone appelé après le rechargement, pour que l'appelant referme son
   *   panneau seulement en cas de succès.
   */
  createCompany(draft: CompanyDraft, onDone?: () => void): void {
    this.mutate(
      (token) => this.http.post(`${AUTH_CONFIG.apiBaseUrl}/companies`, draft, headers(token)),
      onDone,
    );
  }

  /** Édite le contact **principal** (carte « Admin du compte entreprise »). */
  updatePrimaryContact(companyId: string, draft: ContactDraft, onDone?: () => void): void {
    this.mutate(
      (token) =>
        this.http.patch(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contact`,
          draft,
          headers(token),
        ),
      onDone,
    );
  }

  /** Ajoute un contact additionnel. */
  addContact(companyId: string, draft: ContactDraft, onDone?: () => void): void {
    this.mutate(
      (token) =>
        this.http.post(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts`,
          draft,
          headers(token),
        ),
      onDone,
    );
  }

  /** Remplace un contact additionnel. */
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
      onDone,
    );
  }

  /** Retire un contact additionnel. */
  removeContact(companyId: string, contactId: string, onDone?: () => void): void {
    this.mutate(
      (token) =>
        this.http.delete(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts/${contactId}`,
          headers(token),
        ),
      onDone,
    );
  }

  /**
   * Dépose (ou remplace) le KBIS de l'entreprise (multipart), puis recharge le
   * compte pour refléter le fichier et sa date.
   */
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
      onDone,
    );
  }

  /**
   * Récupère le KBIS en **blob** (l'endpoint est authentifié : un `<a href>` ne
   * pourrait pas porter le jeton). L'appelant décide ensuite de l'ouvrir (voir)
   * ou de le télécharger.
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

  /** Enchaîne « jeton → appel » et range la réponse (le compte relu) dans l'état. */
  private request(call: (token: string) => Observable<Account>): void {
    this.auth
      .accessToken$()
      .pipe(switchMap(call))
      .subscribe({
        next: (account) => {
          this.state.set(account);
          this._status.set('ready');
          this._error.set(null);
        },
        error: (error: unknown) => this.fail(error),
      });
  }

  /**
   * Exécute une écriture puis **recharge** le compte.
   *
   * Toutes les mutations d'entreprise/contacts renvoient `void` ou un id (une
   * commande ne produit pas de modèle de lecture) : on relit donc `/me` pour
   * obtenir l'état exact enregistré par le backend, plutôt que de le recomposer
   * localement. `onDone` ne se déclenche qu'au succès — l'appelant ne referme son
   * panneau que si l'écriture a abouti.
   */
  private mutate(call: (token: string) => Observable<unknown>, onDone?: () => void): void {
    this._status.set('loading');
    this.auth
      .accessToken$()
      .pipe(switchMap(call))
      .subscribe({
        next: () => {
          this.load();
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

/**
 * Message affichable.
 *
 * On privilégie celui du backend : il est **rédigé pour l'utilisateur** (« Une
 * entreprise portant ce SIRET est déjà enregistrée. ») et c'est tout l'intérêt
 * d'avoir des erreurs métier catégorisées côté domaine. On ne retombe sur un
 * message générique que faute de mieux.
 */
function readErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Serveur injoignable — le backend B2B est-il démarré ?';
    }
    const body: unknown = error.error;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string' && message !== '') {
        return message;
      }
    }
  }
  return 'Une erreur est survenue. Réessayez.';
}

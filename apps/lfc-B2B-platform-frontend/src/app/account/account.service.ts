import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type {
  CatalogueView,
  DeferredTerm,
  FulfillmentPreferenceView,
  UpdateIdentityPayload,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { NotifyService } from '../notify.service';
import {
  PERSON_ALREADY_ATTACHED,
  refusalFrom,
  type DeclarationOutcome,
  type EstablishmentDraft,
} from './establishment';
import type {
  Account,
  CompanyDraft,
  ContactDraft,
  NavPreferences,
  SettlementMean,
  UserProfileDraft,
} from './account.model';

/**
 * Ce qu'une écriture d'identité envoie. Les trois mentions légales sont
 * facultatives : absentes, le serveur les lit vides et n'y touche pas.
 */
export type IdentityDraft = Pick<UpdateIdentityPayload, 'enseigne' | 'vatNumber'> &
  Partial<Pick<UpdateIdentityPayload, 'raisonSociale' | 'formeJuridique' | 'siret'>>;

const IDENTITY_SAVED = 'Identité mise à jour.';
const KBIS_SAVED = 'KBIS déposé.';
const CONTACT_ADDED = 'Contact ajouté.';
const CONTACT_SAVED = 'Contact enregistré.';
const CONTACT_REMOVED = 'Contact supprimé.';
const PROFILE_SAVED = 'Profil enregistré.';
const TERM_REQUESTED = 'Demande de règlement enregistrée.';
const FULFILLMENT_SAVED = "Préférence d'acheminement enregistrée.";

/**
 * Ce qu'une écriture du **détenteur** envoie : les coordonnées d'un contact,
 * sans rôle — le sien est `owner` par construction.
 */
export type HolderDraft = Omit<ContactDraft, 'role'>;

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

  /**
   * `POST /me/establishment` — la porte pro : profil et société `pending` en un
   * geste, puis relecture de `/me`.
   *
   * Contrairement aux autres écritures, l'échec ne part PAS en toast : il est
   * RENDU, rattaché à son champ, pour s'afficher sous lui (plan §3.3). Le statut
   * de page n'est pas touché pendant le vol — une carte qui disparaîtrait le
   * temps de l'envoi ne pourrait plus montrer l'erreur qui revient.
   *
   * Un 409 « déjà rattaché » n'est pas une erreur à montrer : la personne est
   * dans l'état visé (double clic, second onglet, rejeu). On relit `/me`, qui
   * dira sa société.
   */
  declareEstablishment(draft: EstablishmentDraft): Promise<DeclarationOutcome> {
    return firstValueFrom(
      this.auth
        .accessToken$()
        .pipe(
          switchMap((token) =>
            this.http.post(`${AUTH_CONFIG.apiBaseUrl}/me/establishment`, draft, headers(token)),
          ),
        ),
    ).then(
      (): DeclarationOutcome => {
        this.load();
        this.notify.success('Établissement déclaré.');
        return { kind: 'declared' };
      },
      (error: unknown): DeclarationOutcome => {
        if (httpErrorCode(error) === PERSON_ALREADY_ATTACHED) {
          this.load();
          return { kind: 'already-attached' };
        }
        return refusalFrom(error);
      },
    );
  }

  createCompany(draft: CompanyDraft, onDone?: () => void): void {
    this.mutate(
      (token) => this.http.post(`${AUTH_CONFIG.apiBaseUrl}/companies`, draft, headers(token)),
      'Entreprise créée.',
      onDone,
    );
  }

  /**
   * `PATCH /companies/:id/identity` — l'identité souple, et de quoi COMBLER
   * l'identité légale.
   *
   * Raison sociale, forme juridique et SIRET ne sont retenus par le serveur que
   * s'ils manquent encore : un champ déjà renseigné est ignoré, pas réécrit. Les
   * omettre revient à les envoyer vides — c'est ce que fait l'ancien panneau
   * `entreprise-identite-panel`, qui n'édite que l'enseigne et la TVA.
   *
   * `onDone` ne part qu'au succès ; un panneau qui doit se réarmer sur un échec
   * passe par {@link saveIdentity}.
   */
  updateIdentity(companyId: string, identity: IdentityDraft, onDone?: () => void): void {
    this.mutate((token) => this.patchIdentity(companyId, identity, token), IDENTITY_SAVED, onDone);
  }

  /**
   * Même écriture que {@link updateIdentity}, mais la promesse retombe dans les
   * deux cas : `null` au succès, le **message du serveur** à l'échec.
   *
   * Le message est rendu plutôt que seulement toasté : un SIRET refusé se
   * corrige dans le panneau resté ouvert, sous les yeux de qui l'a saisi — un
   * toast fugace se lit trop tard pour ça.
   */
  saveIdentity(companyId: string, identity: IdentityDraft): Promise<string | null> {
    return this.attempt((token) => this.patchIdentity(companyId, identity, token), IDENTITY_SAVED);
  }

  requestSettlementMean(companyId: string, paymentTerm: SettlementMean, onDone?: () => void): void {
    this.mutate(
      (token) => this.patchPaymentTerm(companyId, paymentTerm, token),
      TERM_REQUESTED,
      onDone,
    );
  }

  /**
   * `PATCH /companies/:id/payment-term` — **demande** un crédit, en promesse
   * qui retombe dans les deux cas : `null` au succès, le message du serveur au
   * refus.
   *
   * Une demande, jamais un accord : le serveur ne touche pas aux termes
   * convenus, et demander un terme déjà accordé retire la demande (vérifié le
   * 2026-09-14, `Company.requestTerm`). Réservé à `owner`/`admin`.
   */
  askPaymentTerm(companyId: string, term: DeferredTerm): Promise<string | null> {
    return this.attempt((token) => this.patchPaymentTerm(companyId, term, token), TERM_REQUESTED);
  }

  /**
   * Pose (ou retire) la **préférence d'acheminement** de sa société.
   *
   * Contrairement au délai de règlement, ce n'est pas une demande adressée au
   * commercial : c'est le client qui sait où il veut être servi.
   */
  preferFulfillment(companyId: string, preference: FulfillmentPreferenceView): Promise<boolean> {
    return this.write(
      (token) => this.patchFulfillment(companyId, preference, token),
      FULFILLMENT_SAVED,
    );
  }

  /**
   * Même écriture que {@link preferFulfillment}, mais le refus rend le
   * **message du serveur** — pour le panneau Préférences de `/mon-compte`, qui
   * le montre sous le choix resté ouvert.
   *
   * ⚠️ Pas `write` : il bascule le statut de page pendant le vol, et
   * `/mon-compte` détruirait alors le panneau (cf. {@link attempt}).
   */
  saveFulfillment(
    companyId: string,
    preference: FulfillmentPreferenceView,
  ): Promise<string | null> {
    return this.attempt(
      (token) => this.patchFulfillment(companyId, preference, token),
      FULFILLMENT_SAVED,
    );
  }

  updatePrimaryContact(companyId: string, draft: ContactDraft, onDone?: () => void): void {
    this.mutate((token) => this.patchHolder(companyId, draft, token), CONTACT_SAVED, onDone);
  }

  /**
   * `PATCH /companies/:id/contact` — les coordonnées du **détenteur**, promesse
   * qui retombe dans les deux cas : `null` au succès, le **message du serveur**
   * à l'échec.
   *
   * Le corps ne porte PAS de rôle : celui du détenteur est constaté, pas choisi,
   * et le schéma du serveur n'en lit aucun (vérifié le 2026-09-14,
   * `contactPayload` dans `payloads.ts`).
   */
  saveHolder(companyId: string, draft: HolderDraft): Promise<string | null> {
    return this.attempt((token) => this.patchHolder(companyId, draft, token), CONTACT_SAVED);
  }

  /**
   * `PATCH /me/profile` — les coordonnées de la **personne connectée**, promesse
   * qui retombe dans les deux cas.
   *
   * Changer l'adresse la change AUSSI chez Auth0, avant notre base, en adresse
   * non vérifiée avec un e-mail de vérification (vérifié le 2026-09-14,
   * `update-my-profile.handler.ts` et `auth0-identity.gateway.ts`) : le
   * panneau le dit avant qu'on enregistre.
   */
  saveMyProfile(draft: UserProfileDraft): Promise<string | null> {
    return this.attempt(
      (token) => this.http.patch(`${AUTH_CONFIG.apiBaseUrl}/me/profile`, draft, headers(token)),
      PROFILE_SAVED,
    );
  }

  addContact(companyId: string, draft: ContactDraft, onDone?: () => void): void {
    this.mutate((token) => this.postContact(companyId, draft, token), CONTACT_ADDED, onDone);
  }

  /**
   * Même ajout que {@link addContact}, mais la promesse retombe dans les deux
   * cas : `null` au succès, le **message du serveur** à l'échec — pour le
   * panneau d'ajout de `/mon-compte`, qui montre le refus là où l'on corrige.
   */
  saveContact(companyId: string, draft: ContactDraft): Promise<string | null> {
    return this.attempt((token) => this.postContact(companyId, draft, token), CONTACT_ADDED);
  }

  updateContact(
    companyId: string,
    contactId: string,
    draft: ContactDraft,
    onDone?: () => void,
  ): void {
    this.mutate(
      (token) => this.patchContact(companyId, contactId, draft, token),
      CONTACT_SAVED,
      onDone,
    );
  }

  /**
   * Même écriture que {@link updateContact}, mais la promesse retombe dans les
   * deux cas : `null` au succès, le **message du serveur** à l'échec — pour le
   * panneau d'édition de `/mon-compte`, qui reste ouvert sur un refus.
   */
  saveContactEdit(
    companyId: string,
    contactId: string,
    draft: ContactDraft,
  ): Promise<string | null> {
    return this.attempt(
      (token) => this.patchContact(companyId, contactId, draft, token),
      CONTACT_SAVED,
    );
  }

  removeContact(companyId: string, contactId: string, onDone?: () => void): void {
    this.mutate(
      (token) => this.deleteContactCall(companyId, contactId, token),
      CONTACT_REMOVED,
      onDone,
    );
  }

  /**
   * Même retrait que {@link removeContact}, mais la promesse retombe dans les
   * deux cas — la fiche de la personne garde sa confirmation et montre le refus.
   */
  deleteContact(companyId: string, contactId: string): Promise<string | null> {
    return this.attempt(
      (token) => this.deleteContactCall(companyId, contactId, token),
      CONTACT_REMOVED,
    );
  }

  uploadKbis(companyId: string, file: File, onDone?: () => void): void {
    this.mutate((token) => this.putKbis(companyId, file, token), KBIS_SAVED, onDone);
  }

  /**
   * Même dépôt que {@link uploadKbis}, mais la promesse retombe dans les deux
   * cas : `null` au succès, le **message du serveur** à l'échec — pour le
   * panneau KBIS de `/mon-compte`, qui montre le refus là où l'on redépose.
   */
  saveKbis(companyId: string, file: File): Promise<string | null> {
    return this.attempt((token) => this.putKbis(companyId, file, token), KBIS_SAVED);
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
    return this.attempt(call, success).then((refusal) => {
      if (refusal !== null) {
        this._status.set('ready');
      }
      return refusal === null;
    });
  }

  /**
   * Comme {@link write}, mais l'échec rend le **message** de l'enveloppe au lieu
   * d'un simple `false`, pour l'écran qui doit le montrer là où l'on corrige.
   *
   * ⚠️ Le statut de page n'est PAS touché pendant le vol, pour la raison que
   * donne `declareEstablishment` : `/mon-compte` remplace tout son contenu par
   * un chargement dès que `status` quitte `ready` (vérifié le 2026-09-14,
   * `ComptePage.view`). Le panneau ouvert serait détruit avec l'envoi, et
   * l'erreur reviendrait vers un écran qui ne peut plus la montrer.
   */
  private attempt(
    call: (token: string) => Observable<unknown>,
    success: string,
  ): Promise<string | null> {
    return firstValueFrom(this.auth.accessToken$().pipe(switchMap(call))).then(
      () => {
        this.load();
        this.notify.success(success);
        return null;
      },
      (error: unknown) => {
        this.notify.error(error);
        return httpErrorMessage(error);
      },
    );
  }

  private postContact(companyId: string, draft: ContactDraft, token: string): Observable<unknown> {
    return this.http.post(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts`,
      draft,
      headers(token),
    );
  }

  private patchHolder(
    companyId: string,
    draft: HolderDraft | ContactDraft,
    token: string,
  ): Observable<unknown> {
    return this.http.patch(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contact`,
      draft,
      headers(token),
    );
  }

  private patchContact(
    companyId: string,
    contactId: string,
    draft: ContactDraft,
    token: string,
  ): Observable<unknown> {
    return this.http.patch(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts/${contactId}`,
      draft,
      headers(token),
    );
  }

  private deleteContactCall(
    companyId: string,
    contactId: string,
    token: string,
  ): Observable<unknown> {
    return this.http.delete(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/contacts/${contactId}`,
      headers(token),
    );
  }

  private putKbis(companyId: string, file: File, token: string): Observable<unknown> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.put(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/kbis`,
      form,
      headers(token),
    );
  }

  private patchPaymentTerm(
    companyId: string,
    paymentTerm: SettlementMean,
    token: string,
  ): Observable<unknown> {
    return this.http.patch(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/payment-term`,
      { paymentTerm },
      headers(token),
    );
  }

  private patchFulfillment(
    companyId: string,
    preference: FulfillmentPreferenceView,
    token: string,
  ): Observable<unknown> {
    return this.http.patch(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/fulfillment-preference`,
      preference,
      headers(token),
    );
  }

  private patchIdentity(
    companyId: string,
    identity: IdentityDraft,
    token: string,
  ): Observable<unknown> {
    return this.http.patch(
      `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/identity`,
      identity,
      headers(token),
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

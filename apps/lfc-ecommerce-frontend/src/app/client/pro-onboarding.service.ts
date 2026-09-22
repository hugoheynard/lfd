import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';

import { AccountService } from '../account/account.service';
import type { EstablishmentDraft, EstablishmentRefusal } from '../account/establishment';
import { AuthFacade, type ProRegistration } from '../auth/auth.facade';

/**
 * Le raccord entre la porte pro et le dossier réel : au retour d'Auth0, la
 * déclaration saisie sur `/ouverture-compte-pro` part par
 * `POST /me/establishment` (plan `plan-inscription-pro-seule.md` §3.1).
 *
 * **Point d'injection prévu : le shell client**, pour son EFFET et non pour son
 * API — exactement comme `ClientOnboarding`. Un service `providedIn: 'root'`
 * que personne n'injecte ne s'exécute jamais ; la carte « Compléter mon
 * dossier » l'injecte aussi, mais elle n'existe que sur `/mon-compte`, et le
 * retour d'Auth0 peut se poser ailleurs.
 *
 * Trois gardes, du plus proche au plus sûr :
 *
 * - **une seule tentative par chargement** : le signal de la façade est vidé,
 *   et un drapeau interdit de repartir si un effet se rejoue ;
 * - **rien ne se crée si `/me` dit déjà une société** : on attend donc la
 *   lecture du compte avant de déclarer ;
 * - **le serveur a le dernier mot** : un rejeu qui passerait quand même finit
 *   en 409 « déjà rattaché », que `AccountService` traite comme l'état visé —
 *   il relit `/me` et rien ne s'affiche.
 *
 * `/bienvenue` et `ClientOnboarding` ne sont pas touchés : les deux parcours
 * lisent chacun leur signal de la façade.
 */
@Injectable({ providedIn: 'root' })
export class ProOnboarding {
  private readonly auth = inject(AuthFacade);
  private readonly account = inject(AccountService);

  private readonly started = signal(false);
  private readonly _declaring = signal(false);
  private readonly _lastError = signal<EstablishmentRefusal | null>(null);
  private readonly _returnedDraft = signal<EstablishmentDraft | null>(null);

  /** Vrai pendant l'envoi de la déclaration rapportée d'Auth0. */
  readonly declaring = this._declaring.asReadonly();

  /** Le refus de cette déclaration, s'il y en a eu un. */
  readonly lastError = this._lastError.asReadonly();

  /**
   * Les champs de la déclaration refusée, à rendre à la carte « Compléter mon
   * dossier » : la personne ne retape pas ce qu'elle vient de saisir.
   */
  readonly returnedDraft = this._returnedDraft.asReadonly();

  /**
   * **Une déclaration pro est en cours, ou vient d'échouer.**
   *
   * 🔴 C'est la RÉSERVE qui garde `/mon-compte` ouvert à qui n'a pas encore de
   * société (Hugo, 2026-09-22). Depuis que la porte pro vit sur `/mon-profil`,
   * les écrans de société se ferment sans entreprise — mais quelqu'un qui
   * s'est inscrit par la porte pro revient d'Auth0 avec une déclaration à
   * envoyer, et la carte « Compléter mon dossier » est son SEUL rattrapage
   * quand cet envoi échoue. Fermer sans cette réserve le laisserait dehors,
   * avec un dossier commencé et nulle part où le reprendre.
   *
   * ⚠️ Les trois termes sont nécessaires : l'envoi en vol, celui qui n'est pas
   * encore parti, et celui qui a été refusé. Il manquerait le dernier — le seul
   * qui dure — qu'on fermerait la porte au moment précis où elle sert.
   */
  readonly declarationUnderway = computed(
    () =>
      this._declaring() ||
      this.auth.pendingProRegistration() !== null ||
      this._lastError() !== null,
  );

  /**
   * La carte « Compléter mon dossier » a-t-elle lieu d'être ?
   *
   * Quand on SAIT que la personne n'a aucune société, et qu'aucune déclaration
   * n'est en route — ni en vol, ni encore en attente d'être envoyée. Sans la
   * seconde condition, la carte clignoterait au retour d'Auth0, le temps que la
   * déclaration parte.
   */
  readonly needsDossier = computed(
    () =>
      this.account.hasNoCompany() &&
      !this._declaring() &&
      this.auth.pendingProRegistration() === null,
  );

  constructor() {
    effect(() => {
      const registration = this.auth.pendingProRegistration();
      const status = this.account.status();
      if (registration === null || !this.auth.isAuthenticated() || this.started()) {
        return;
      }
      // Tant que `/me` n'a pas répondu, on ne sait pas s'il y a déjà une
      // société. Un échec de lecture n'empêche pas de déclarer : le serveur
      // tranchera, et un doublon finit en 409.
      if (status !== 'ready' && status !== 'error') {
        return;
      }
      untracked(() => this.declare(registration));
    });
  }

  /** Oublie le refus rapporté — la carte le fait quand elle renvoie la sienne. */
  clearFailure(): void {
    this._lastError.set(null);
  }

  private declare(registration: ProRegistration): void {
    this.started.set(true);
    this.auth.pendingProRegistration.set(null);
    if (this.account.companies().length > 0) {
      return;
    }
    const draft: EstablishmentDraft = {
      firstName: registration.firstName,
      lastName: registration.lastName,
      phone: registration.phone,
      enseigne: registration.enseigne,
    };
    this._declaring.set(true);
    void this.account.declareEstablishment(draft).then((outcome) => {
      this._declaring.set(false);
      if (outcome.kind === 'refused') {
        this._lastError.set(outcome);
        this._returnedDraft.set(draft);
      }
    });
  }
}

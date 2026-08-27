import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { AuthFacade, type PendingProfile } from '../../auth/auth.facade';
import { ClientChrome } from '../../client/client-chrome.service';
import { ClientPage } from '../../client/client-page/client-page';
import { ClientCopyService } from '../../client/copy/client-copy.service';
import { MOCK_CLIENT } from '../../client/mock-client';

import { RappelPanel } from './rappel-panel/rappel-panel';
import { WelcomeStep } from './welcome-step/welcome-step';

/** Là où l'on va une fois entré. */
const AFTER_ENTRY = '/commande';

/**
 * La porte d'entrée : trois champs, aucun document, et deux chemins.
 *
 * L'écran ne connaît d'Auth0 que deux gestes — `register` et `login` — et il ne
 * les fait qu'en réponse à un geste de la personne. Le reste appartient au SDK :
 * l'écran de passkey, le retour du callback, la restauration de la route.
 *
 * Il n'y a plus d'étape « lien envoyé » ni « compte créé » : elles jouaient le
 * rôle d'Auth0 tant que rien n'était branché. Maintenant que ça l'est, elles
 * mentiraient — on ne revient pas ici après avoir posé sa passkey, on arrive
 * directement sur la commande.
 */
@Component({
  selector: 'app-accueil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientPage, RappelPanel, WelcomeStep],
  templateUrl: './accueil-page.html',
  styleUrl: './accueil-page.scss',
})
export class AccueilPage {
  private readonly chrome = inject(ClientChrome);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);

  protected readonly t = inject(ClientCopyService).t;

  protected readonly phone = MOCK_CLIENT.phone;

  protected readonly panelOpen = signal(false);
  protected readonly bookedSlot = signal<string | null>(null);
  protected readonly quotePending = signal(false);

  protected readonly kicker = computed(() =>
    this.panelOpen() ? this.t().chrome.kickerRappel : this.t().chrome.kickerWelcome,
  );

  protected readonly heading = computed(() =>
    this.panelOpen() ? this.t().hero.rappelTitle : this.t().hero.welcomeTitle,
  );

  protected readonly intro = computed(() =>
    this.panelOpen() ? this.t().hero.rappelIntro : this.t().hero.welcomeIntro,
  );

  /** L'argument n'accompagne que l'inscription : on ne vend plus à qui entre. */
  protected readonly showProof = computed(() => !this.panelOpen());

  constructor() {
    // L'en-tête appartient au shell ; l'écran lui dit seulement quoi afficher.
    effect(() => {
      this.chrome.kicker.set(this.kicker());
      this.chrome.back.set(this.panelOpen() ? (): void => this.panelOpen.set(false) : null);
    });
    // Qui est déjà entré n'a rien à faire sur la porte d'entrée. Le cas arrive
    // pour de bon : le SDK restaure la session au chargement, et cette page est
    // la racine de l'app.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigateByUrl(AFTER_ENTRY);
      }
    });
    // Au-delà du pli, la marque remonte dans la colonne bleue de cet écran : la
    // barre du shell s'efface plutôt que de faire doublon.
    this.chrome.barOnDesktop.set(false);
    // Un visiteur n'a pas de menu : il a besoin de savoir OÙ il est, donc la
    // barre garde la pastille de marque.
    this.chrome.menu.set(null);
    // Ni cloche : on ne notifie pas quelqu'un dont on n'a pas encore le compte.
    this.chrome.bell.set(null);
  }

  /**
   * Les trois champs sont pris. Ils partent avec la personne dans l'`appState`
   * — Auth0 ne sait ni les collecter ni les rendre — et reviendront se poser
   * sur le compte au retour.
   */
  protected signUp(profile: PendingProfile): void {
    this.auth.register(AFTER_ENTRY, profile);
  }

  /** Déjà client : l'écran d'Auth0 reconnaîtra la passkey, ou le mot de passe. */
  protected signIn(email: string): void {
    this.auth.login(AFTER_ENTRY, email);
  }

  protected openPanel(): void {
    this.panelOpen.set(true);
  }

  /** ⚠️ Maquette : la demande de devis traiteur n'a pas encore son écran. */
  protected openQuote(): void {
    this.quotePending.set(true);
  }

  protected book(slot: string): void {
    this.bookedSlot.set(slot);
    this.panelOpen.set(false);
  }
}

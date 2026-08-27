import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { FoldSurfaceDirective } from 'fold-ng';

import { ClientChrome } from '../../client/client-chrome.service';
import { ClientCopyService } from '../../client/copy/client-copy.service';
import { LangSwitch } from '../../client/lang-switch/lang-switch';

import { KNOWN_PHONE } from './call-slots';
import { EnteredStep } from './entered-step/entered-step';
import { LoginStep } from './login-step/login-step';
import { RappelPanel } from './rappel-panel/rappel-panel';
import { WelcomeStep } from './welcome-step/welcome-step';

/** Les trois temps de l'entrée, plus le panneau qui se pose par-dessus. */
type Step = 'welcome' | 'login' | 'entered';

@Component({
  selector: 'app-accueil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSurfaceDirective, LangSwitch, EnteredStep, LoginStep, RappelPanel, WelcomeStep],
  templateUrl: './accueil-page.html',
  styleUrl: './accueil-page.scss',
})
export class AccueilPage {
  private readonly chrome = inject(ClientChrome);

  protected readonly t = inject(ClientCopyService).t;

  protected readonly phone = KNOWN_PHONE;

  protected readonly step = signal<Step>('welcome');
  protected readonly panelOpen = signal(false);
  protected readonly linkSent = signal(false);
  protected readonly bookedSlot = signal<string | null>(null);
  protected readonly quotePending = signal(false);

  /** Le retour n'existe que là où on est venu de quelque part. */
  private readonly canGoBack = computed(() => this.panelOpen() || this.step() === 'login');

  /** Le sur-titre du chrome dit où on est, pas où on va. */
  protected readonly kicker = computed(() => {
    const c = this.t().chrome;
    if (this.panelOpen()) {
      return c.kickerRappel;
    }
    switch (this.step()) {
      case 'login':
        return c.kickerLogin;
      case 'entered':
        return c.kickerEntered;
      default:
        return c.kickerWelcome;
    }
  });

  protected readonly heading = computed(() => {
    const h = this.t().hero;
    if (this.panelOpen()) {
      return h.rappelTitle;
    }
    switch (this.step()) {
      case 'login':
        return h.loginTitle;
      case 'entered':
        return h.enteredTitle;
      default:
        return h.welcomeTitle;
    }
  });

  protected readonly intro = computed(() => {
    const h = this.t().hero;
    if (this.panelOpen()) {
      return h.rappelIntro;
    }
    switch (this.step()) {
      case 'login':
        return this.linkSent() ? h.loginIntroSent : h.loginIntroAsk;
      case 'entered':
        return h.enteredIntro;
      default:
        return h.welcomeIntro;
    }
  });

  /** Le titre d'accueil est le plus long : il descend d'un cran ailleurs. */
  protected readonly bigHeading = computed(() => !this.panelOpen() && this.step() === 'welcome');

  /** L'argument n'accompagne que l'inscription : on ne vend plus à qui entre. */
  protected readonly showProof = computed(() => this.bigHeading());

  constructor() {
    // L'en-tête appartient au shell ; l'écran lui dit seulement quoi afficher.
    effect(() => {
      this.chrome.kicker.set(this.kicker());
      this.chrome.back.set(this.canGoBack() ? (): void => this.back() : null);
    });
    // Au-delà du pli, la marque remonte dans la colonne bleue de cet écran : la
    // barre du shell s'efface plutôt que de faire doublon.
    this.chrome.barOnDesktop.set(false);
  }

  private back(): void {
    if (this.panelOpen()) {
      this.panelOpen.set(false);
      return;
    }
    this.goTo('welcome');
  }

  protected goTo(step: Step): void {
    this.linkSent.set(false);
    this.step.set(step);
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

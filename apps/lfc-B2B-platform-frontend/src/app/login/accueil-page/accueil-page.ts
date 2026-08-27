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

import { KNOWN_PHONE } from './call-slots';
import { EnteredStep } from './entered-step/entered-step';
import { LoginStep } from './login-step/login-step';
import { RappelPanel } from './rappel-panel/rappel-panel';
import { WelcomeStep } from './welcome-step/welcome-step';

/** Les trois temps de l'entrée, plus le panneau qui se pose par-dessus. */
type Step = 'welcome' | 'login' | 'entered';

/**
 * L'accueil de l'app CLIENT — la page d'entrée, pas un formulaire de connexion.
 *
 * Elle porte tout le bleu (le chrome : barre de marque fixe + accroche) et la
 * feuille crème (le corps). Le contenu du corps change ; la barre, non — c'est
 * ce qui en fait le chrome.
 *
 * ⚠️ **Maquette.** Rien ne part sur le réseau : ni le compte, ni le lien, ni la
 * demande de rappel. Les écrans, eux, sont ceux de la réf.
 */
@Component({
  selector: 'app-accueil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSurfaceDirective, EnteredStep, LoginStep, RappelPanel, WelcomeStep],
  templateUrl: './accueil-page.html',
  styleUrl: './accueil-page.scss',
})
export class AccueilPage {
  private readonly chrome = inject(ClientChrome);

  protected readonly phone = KNOWN_PHONE;

  protected readonly step = signal<Step>('welcome');
  protected readonly panelOpen = signal(false);
  protected readonly linkSent = signal(false);
  protected readonly bookedSlot = signal<string | null>(null);

  /** Le retour n'existe que là où on est venu de quelque part. */
  private readonly canGoBack = computed(() => this.panelOpen() || this.step() === 'login');

  /** Le sur-titre du chrome dit où on est, pas où on va. */
  protected readonly kicker = computed(() => {
    if (this.panelOpen()) {
      return 'Rappel';
    }
    switch (this.step()) {
      case 'login':
        return 'Connexion';
      case 'entered':
        return 'Compte créé';
      default:
        return 'Bienvenue';
    }
  });

  protected readonly heading = computed(() => {
    if (this.panelOpen()) {
      return 'On vous rappelle quand ?';
    }
    switch (this.step()) {
      case 'login':
        return 'Content de vous revoir.';
      case 'entered':
        return 'Vous êtes connecté.';
      default:
        return 'Le pain de la station, réservé en deux minutes.';
    }
  });

  protected readonly intro = computed(() => {
    if (this.panelOpen()) {
      return 'On appelle depuis le fournil, jamais depuis un centre.';
    }
    switch (this.step()) {
      case 'login':
        return this.linkSent()
          ? 'Un lien de connexion vient de partir.'
          : 'Entrez votre e-mail, on vous envoie un lien.';
      case 'entered':
        return 'Compte créé sans mot de passe, sans formulaire d’entreprise. La commande commence maintenant.';
      default:
        return 'Vous choisissez, nous préparons.';
    }
  });

  /** Le titre d'accueil est le plus long : il descend d'un cran ailleurs. */
  protected readonly bigHeading = computed(() => !this.panelOpen() && this.step() === 'welcome');

  constructor() {
    // L'en-tête appartient au shell ; l'écran lui dit seulement quoi afficher.
    effect(() => {
      this.chrome.kicker.set(this.kicker());
      this.chrome.back.set(this.canGoBack() ? (): void => this.back() : null);
    });
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

  protected book(slot: string): void {
    this.bookedSlot.set(slot);
    this.panelOpen.set(false);
  }
}

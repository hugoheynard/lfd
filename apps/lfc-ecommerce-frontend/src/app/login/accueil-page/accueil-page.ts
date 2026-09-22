import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { ShopLevel } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';

import { AuthFacade, type PendingProfile, type ProRegistration } from '../../auth/auth.facade';
import { ClientChrome } from '../../client/client-chrome.service';
import { ClientPage } from '../../client/shell-bienvenue/client-page';
import { ClientCopyService } from '../../client/copy/client-copy.service';
import { ClientIdentity } from '../../client/client-identity.service';
import { ClientLocale } from '../../client/client-locale.service';
import { proAccountCopy } from '../../client/copy/screens/pro-account.copy';
import { ClientFeatureAccess } from '../../client/feature-access/client-feature-access.service';
import { WORKSPACE_HOME_ROUTE } from '../../client/client-workspace-switch.service';

import { SignInDialog } from '../sign-in-dialog/sign-in-dialog';

import { DoorSwitch, type SignupDoor } from './door-switch/door-switch';
import { ProStep } from './pro-step/pro-step';
import { RappelDialog } from './rappel-dialog/rappel-dialog';
import { WelcomeStep } from './welcome-step/welcome-step';

/**
 * Là où l'on va une fois entré par la porte PARTICULIER : l'accueil de
 * l'ESPACE, décidé au retour (`workspaceHomeGuard`).
 */
const AFTER_ENTRY = WORKSPACE_HOME_ROUTE;

/**
 * Là où mène la porte PRO, toujours : le dossier attend la vérification, et la
 * carte « Compléter mon dossier » y rattrape un retour d'Auth0 manqué.
 *
 * ⚠️ Ce n'est PAS la même destination que la porte particulier, et c'est la
 * raison pour laquelle les deux portes gardent chacune la leur bien qu'elles
 * partagent la page : ce qui attend un pro au retour n'est pas ce qui attend
 * un particulier.
 */
const AFTER_ENTRY_PRO = '/mon-compte';

/**
 * `/inscription` — **la porte d'entrée, et elle en a deux** : particulier et
 * professionnel, sur une seule page (handoff `handoff-inscription`, §1).
 *
 * 🔴 UN SEGMENTÉ, PAS DEUX URLS. Le pro atterrissait sur `/ouverture-compte-pro`
 * et le particulier ici ; qui se trompait de porte devait revenir en arrière et
 * retrouver l'autre lien. Les deux adresses existent toujours — une adresse
 * servie une fois est servie pour toujours — mais elles ouvrent le même écran,
 * sur la porte que leur `data.door` désigne.
 *
 * Le BANDEAU suit la porte : accroche, promesse et trois preuves changent avec
 * elle. C'est tout l'intérêt d'avoir gardé une colonne d'argument — elle
 * n'argumente pas la même chose selon qui lit.
 *
 * L'écran ne connaît d'Auth0 que trois gestes — `register`, `registerPro` et
 * `login` — et il ne les fait qu'en réponse à un geste de la personne. Le reste
 * appartient au SDK : l'écran de passkey ou de mot de passe, le retour du
 * callback, la restauration de la route.
 */
@Component({
  selector: 'app-accueil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientPage, DoorSwitch, ProStep, WelcomeStep],
  templateUrl: './accueil-page.html',
  styleUrl: './accueil-page.scss',
})
export class AccueilPage {
  private readonly chrome = inject(ClientChrome);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly locale = inject(ClientLocale);
  private readonly access = inject(ClientFeatureAccess);

  protected readonly t = inject(ClientCopyService).t;

  /**
   * La porte ouverte. Elle vient de la ROUTE au premier rendu — `data.door` —
   * puis du segmenté ; les deux écrivent le même signal, de sorte qu'aucun
   * écran ne dépend de la façon dont on est arrivé.
   */
  protected readonly door = signal<SignupDoor>(
    inject(ActivatedRoute).snapshot.data['door'] === 'pro' ? 'pro' : 'perso',
  );

  /** Le numéro sur lequel le fournil rappellera, quand le compte en porte un. */
  protected readonly phone = inject(ClientIdentity).phone;

  /**
   * Le créneau de rappel obtenu, s'il y en a un.
   *
   * 🔴 Le CHOIX, lui, se fait dans un DIALOGUE (Hugo, 2026-09-21) : il occupait
   * l'écran entier — formulaire remplacé, accroche changée, « retour » dans la
   * barre — alors qu'il ne conditionne rien. Le formulaire reste donc dessous,
   * visible et intact.
   */
  protected readonly bookedSlot = signal<string | null>(null);

  private readonly panels = inject(FoldPanelHostService);

  private readonly proCopy = computed(() => proAccountCopy(this.locale.current()));

  /**
   * Le niveau de la boutique, pour la promesse « ouvre bientôt » de la porte
   * pro. `null` tant que la lecture est en vol ; un échec vaut `closed`.
   */
  protected readonly shopLevel = computed<ShopLevel | null>(() =>
    this.access.state() === 'loading' ? null : this.access.shop(),
  );

  protected readonly kicker = computed(() =>
    this.door() === 'pro' ? this.proCopy().door.kicker : this.t().chrome.kickerWelcome,
  );

  protected readonly heading = computed(() =>
    this.door() === 'pro' ? this.proCopy().door.heading : this.t().hero.welcomeTitle,
  );

  protected readonly intro = computed(() =>
    this.door() === 'pro' ? this.proCopy().door.intro : this.t().hero.welcomeIntro,
  );

  /**
   * Les trois preuves de la colonne d'encre, selon la porte.
   *
   * ⚠️ Elles ne sont pas interchangeables : « pas d'acompte » ne dit rien à qui
   * ouvre un compte d'établissement, et « facturation mensuelle » ne dit rien à
   * qui vient chercher une fournée. Montrer les mauvaises revient à argumenter
   * auprès de quelqu'un d'autre que celui qui lit.
   */
  protected readonly proof = computed<readonly string[]>(() =>
    this.door() === 'pro' ? this.proCopy().door.proof : this.t().aside.proof,
  );

  /**
   * Ce que dit la porte de connexion, au bas de l'encre — et elle change avec
   * la porte (Hugo, 2026-09-21).
   *
   * ⚠️ Les deux dictionnaires ont chacun leur paire, et elles ne disent pas la
   * même chose : `signup` tutoie un client de passage, `proAccount` s'adresse à
   * un établissement. En servir une seule pour les deux portes remettrait le
   * problème que ce segmenté vient de régler.
   */
  protected readonly signInLead = computed(() =>
    this.door() === 'pro' ? this.proCopy().door.alreadyLead : this.t().signup.alreadyLead,
  );

  protected readonly signInLink = computed(() =>
    this.door() === 'pro' ? this.proCopy().door.alreadyLink : this.t().signup.alreadyLink,
  );

  constructor() {
    // L'en-tête appartient au shell ; l'écran lui dit seulement quoi afficher.
    effect(() => this.chrome.kicker.set(this.kicker()));
    this.chrome.back.set(null);
    // Qui est déjà entré n'a rien à faire sur la porte d'entrée. Le cas arrive
    // pour de bon : le SDK restaure la session au chargement, et cette page est
    // la racine de l'app.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigateByUrl(this.door() === 'pro' ? AFTER_ENTRY_PRO : AFTER_ENTRY);
      }
    });
    // La barre du shell s'efface au-delà du pli : c'est le châssis
    // (`ClientPage`) qui l'éteint, et qui la rallume en partant.
    // Un visiteur n'a pas de menu : il a besoin de savoir OÙ il est, donc la
    // barre garde la pastille de marque.
    this.chrome.menu.set(false);
    // Ni cloche : on ne notifie pas quelqu'un dont on n'a pas encore le compte.
    this.chrome.bell.set(null);
  }

  protected openDoor(door: SignupDoor): void {
    this.door.set(door);
  }

  /**
   * Ouvre le choix du créneau.
   *
   * ⚠️ `undefined` = fermé sans choisir, et ce n'est PAS la même chose que
   * `null` : annuler un rappel déjà obtenu se fait par le bouton « Annuler » de
   * l'encart. Confondre les deux effacerait le créneau de qui a seulement
   * regardé la liste.
   */
  protected async openRappel(): Promise<void> {
    const slot = await RappelDialog.open(this.panels, { phone: this.phone() ?? '' }).closed;
    if (slot !== undefined) {
      this.bookedSlot.set(slot);
    }
  }

  /**
   * Les trois champs sont pris. Ils partent avec la personne dans l'`appState`
   * — Auth0 ne sait ni les collecter ni les rendre — et reviendront se poser
   * sur le compte au retour.
   */
  protected signUp(profile: PendingProfile): void {
    this.auth.register(AFTER_ENTRY, profile);
  }

  /**
   * La porte pro : `registerPro`, et le MOT DE PASSE plutôt que la passkey.
   *
   * 🔴 Un compte pro change de mains — un gérant, un chef, un remplaçant — et
   * une passkey liée à un appareil ne suit pas (handoff §5). C'est
   * `registerPro` qui porte cette différence ; l'écran ne fait que la nommer.
   */
  protected signUpPro(registration: ProRegistration): void {
    this.auth.registerPro(AFTER_ENTRY_PRO, registration);
  }

  /**
   * Déjà client : le **dialogue des méthodes**, pas la redirection directe.
   *
   * 🔴 Ce geste partait droit chez Auth0 (Hugo, 2026-09-22 : « quand je fais me
   * connecter j'arrive sur la page inscription »). Deux conséquences, et la
   * seconde est la pire : l'écran d'arrivée n'était pas celui qu'on attendait,
   * et **rien n'avait annoncé que Google était un chemin possible**. Qui a
   * ouvert son compte par un fournisseur se retrouvait devant un mot de passe
   * qu'il n'a jamais posé.
   *
   * L'adresse déjà tapée sur la carte est transmise : elle préremplira l'écran
   * d'Auth0 si la personne prend le chemin de l'e-mail.
   */
  protected signIn(email: string): void {
    SignInDialog.open(this.panels, this.door() === 'pro' ? AFTER_ENTRY_PRO : AFTER_ENTRY, email);
  }

  /** Les deux fournisseurs, et la même destination que la saisie à la main. */
  protected continueWithGoogle(): void {
    this.auth.continueWithGoogle(AFTER_ENTRY);
  }

  protected continueWithFacebook(): void {
    this.auth.continueWithFacebook(AFTER_ENTRY);
  }
}

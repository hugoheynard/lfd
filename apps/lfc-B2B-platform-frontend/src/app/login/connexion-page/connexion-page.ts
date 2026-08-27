import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldIconComponent,
  FoldInputComponent,
} from 'fold-ng';

/** Les trois temps de l'écran de connexion. */
type Step = 'ask' | 'sent' | 'connected';

/**
 * Connexion à l'app CLIENT — **par lien e-mail**, sans mot de passe.
 *
 * Pourquoi pas Auth0 / mot de passe : le parcours retenu (handoff
 * `02-parcours-commande.md`) ne demande jamais de mot de passe. On saisit une
 * adresse, on reçoit un lien, on entre. Le SMS viendra en second canal.
 *
 * ⚠️ **Maquette.** Aucun appel réseau : `sendLink()` avance simplement l'état, et
 * « Simuler le clic sur le lien » joue le retour du lien. Le jour où le backend
 * expose l'envoi et la vérification du jeton, seules ces trois méthodes bougent —
 * la vue, elle, est définitive.
 */
@Component({
  selector: 'app-connexion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-theme': 'lfc-app' },
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldIconComponent,
    FoldInputComponent,
  ],
  templateUrl: './connexion-page.html',
  styleUrl: './connexion-page.scss',
})
export class ConnexionPage {
  protected readonly step = signal<Step>('ask');
  protected readonly email = signal('');

  /** Le lien a été renvoyé au moins une fois — on le dit, sinon le clic est muet. */
  protected readonly resent = signal(false);

  /** La porte « première visite » est dessinée mais son écran n'existe pas encore. */
  protected readonly signupPending = signal(false);

  /** Une adresse plausible suffit : le vrai verdict, c'est le lien qui arrive. */
  protected readonly emailLooksValid = computed(() => /.+@.+\..+/.test(this.email().trim()));

  /** Le sur-titre du chrome dit où on en est, pas où on va. */
  protected readonly kicker = computed(() => {
    switch (this.step()) {
      case 'sent':
        return 'Lien envoyé';
      case 'connected':
        return 'Connecté';
      default:
        return 'Connexion';
    }
  });

  /** Le titre d'accroche : deux temps seulement, la connexion et son après. */
  protected readonly heading = computed(() =>
    this.step() === 'connected' ? 'Vous êtes connecté.' : 'Content de vous revoir.',
  );

  protected readonly intro = computed(() => {
    switch (this.step()) {
      case 'sent':
        return 'Un lien de connexion vient de partir.';
      case 'connected':
        return 'Compte reconnu, sans mot de passe.';
      default:
        return 'Entrez votre e-mail, on vous envoie un lien.';
    }
  });

  protected sendLink(): void {
    if (this.emailLooksValid()) {
      this.resent.set(false);
      this.step.set('sent');
    }
  }

  protected resend(): void {
    this.resent.set(true);
  }

  /** Retour à la saisie — l'adresse reste, on la corrige plutôt que la retaper. */
  protected editEmail(): void {
    this.resent.set(false);
    this.step.set('ask');
  }

  protected openSignup(): void {
    this.signupPending.set(true);
  }

  /** Maquette : joue le retour du lien reçu par e-mail. */
  protected simulateLinkClick(): void {
    this.step.set('connected');
  }
}

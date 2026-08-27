import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldIconComponent,
  FoldInputComponent,
} from 'fold-ng';

import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import { DoorCard } from '../door-card/door-card';
import { RuleOu } from '../rule-ou/rule-ou';

/**
 * Connexion **par lien e-mail**, sans mot de passe : on saisit une adresse, on
 * reçoit un lien, on entre. Le SMS viendra en second canal.
 *
 * ⚠️ Maquette : rien ne part. « Simuler le clic sur le lien » joue le retour du
 * lien à la place de la boîte mail.
 */
@Component({
  selector: 'app-login-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldIconComponent,
    FoldInputComponent,
    DoorCard,
    RuleOu,
  ],
  templateUrl: './login-step.html',
  styleUrl: './login-step.scss',
})
export class LoginStep {
  readonly entered = output<void>();
  readonly wantsSignup = output<void>();
  /** L'écran a basculé entre « demander » et « envoyé » — le chrome suit. */
  readonly sentChange = output<boolean>();

  protected readonly t = inject(ClientCopyService).t;

  protected readonly sent = signal(false);
  protected readonly resent = signal(false);
  protected readonly email = signal('');

  /** Une adresse plausible suffit : le vrai verdict, c'est le lien qui arrive. */
  protected readonly looksValid = computed(() => /.+@.+\..+/.test(this.email().trim()));

  protected readonly sentLine = computed(() =>
    fill(this.t().login.sentBody, { email: this.email() }),
  );

  protected send(): void {
    if (this.looksValid()) {
      this.resent.set(false);
      this.sent.set(true);
      this.sentChange.emit(true);
    }
  }

  protected resend(): void {
    this.resent.set(true);
  }

  /** Retour à la saisie — l'adresse reste, on la corrige plutôt que la retaper. */
  protected editEmail(): void {
    this.resent.set(false);
    this.sent.set(false);
    this.sentChange.emit(false);
  }
}

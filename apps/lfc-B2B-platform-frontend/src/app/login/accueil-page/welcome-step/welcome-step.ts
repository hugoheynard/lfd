import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FoldButtonComponent, FoldCardComponent, FoldInputComponent } from 'fold-ng';

import { DoorCard } from '../door-card/door-card';
import { RuleOu } from '../rule-ou/rule-ou';

/**
 * L'accueil visiteur : trois champs, aucun document, et deux portes — la
 * connexion pour qui a déjà un compte, le rappel pour qui vient de la part
 * d'une entreprise.
 *
 * Chaque champ a une raison énonçable à voix haute, et le téléphone la dit
 * sous lui. Pas de mot de passe, pas de KBIS : le compte s'ouvre **incomplet**,
 * ce qui n'est pas la même chose qu'inactif.
 */
@Component({
  selector: 'app-welcome-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCardComponent, FoldInputComponent, DoorCard, RuleOu],
  templateUrl: './welcome-step.html',
  styleUrl: './welcome-step.scss',
})
export class WelcomeStep {
  /** Le créneau de rappel déjà obtenu, s'il y en a un. */
  readonly bookedSlot = input<string | null>(null);

  /** Le numéro sur lequel le fournil rappellera. */
  readonly phone = input.required<string>();

  readonly signedUp = output<void>();
  readonly wantsLogin = output<void>();
  readonly wantsCallback = output<void>();
  readonly cancelledCallback = output<void>();

  protected readonly firstName = signal('');
  protected readonly email = signal('');
  protected readonly tel = signal('');

  protected readonly complete = computed(
    () =>
      this.firstName().trim() !== '' &&
      /.+@.+\..+/.test(this.email().trim()) &&
      this.tel().trim() !== '',
  );

  protected readonly proTitle = computed(() =>
    this.bookedSlot() ? 'Rappel demandé' : 'Intéressé par l’espace pro ?',
  );

  protected submit(): void {
    if (this.complete()) {
      this.signedUp.emit();
    }
  }
}

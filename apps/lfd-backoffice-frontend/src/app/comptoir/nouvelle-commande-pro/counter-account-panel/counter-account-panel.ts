import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { GestureIntents } from '../../../shared/gesture-intents';
import { CounterAccountsService } from '../../counter-accounts.service';
import { prospectIssue } from '../prospect-panel/prospect-form';

const INTENT = 'open-counter-account';

/** Le texte à côté de la case, mot pour mot (`plan-comptes-du-comptoir.md`, § 3.5). */
export const IDENTITY_SEEN_HINT =
  'En cochant, vous attestez avoir vu une pièce d’identité de cette personne. Votre nom est enregistré.';

/**
 * **Ouvrir un compte pro au comptoir** (`plan-comptes-du-comptoir.md`, § 3.1,
 * § 3.5) : l'enseigne et son contact, sans SIRET ni adresse — le commerce
 * complète la fiche à la conversion.
 *
 * La case « J'ai vu une preuve d'identité » ne bloque rien : le compte
 * s'ouvre qu'elle soit cochée ou non, et le serveur l'attribue à l'agent
 * connecté. Le panneau se ferme en rendant l'id du compte ouvert.
 */
@Component({
  selector: 'app-counter-account-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './counter-account-panel.html',
  styleUrl: './counter-account-panel.scss',
})
export class CounterAccountPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  private readonly accounts = inject(CounterAccountsService);
  private readonly panel = inject(FoldPanelRef<string>);
  private readonly intents = new GestureIntents();

  protected readonly identityHint = IDENTITY_SEEN_HINT;
  protected readonly enseigne = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly fonction = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly identitySeen = signal(false);
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly issue = computed(() => {
    const missing = prospectIssue({
      enseigne: this.enseigne(),
      firstName: this.firstName(),
      lastName: this.lastName(),
      email: this.email(),
      phone: this.phone(),
    });
    if (missing !== '') {
      return missing;
    }
    return this.lastName().trim() === '' ? 'Indiquez le nom du contact.' : '';
  });
  protected readonly pristine = computed(
    () => this.enseigne() === '' && this.firstName() === '' && this.email() === '',
  );

  protected async submit(): Promise<void> {
    if (this.issue() !== '' || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    try {
      const id = await this.accounts.open(
        {
          enseigne: this.enseigne().trim(),
          contact: {
            firstName: this.firstName().trim(),
            lastName: this.lastName().trim(),
            fonction: this.fonction().trim(),
            email: this.email().trim(),
            phone: this.phone().trim(),
          },
          identitySeen: this.identitySeen(),
        },
        this.intents.keyFor(INTENT),
      );
      this.intents.done(INTENT);
      this.panel.close(id);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le compte n’a pas pu être ouvert.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.panel.close();
  }
}

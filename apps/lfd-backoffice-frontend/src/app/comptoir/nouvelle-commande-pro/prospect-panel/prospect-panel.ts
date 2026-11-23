import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { AdminCompaniesService } from '../../../comptes-clients/admin-companies.service';
import { GestureIntents } from '../../../shared/gesture-intents';
import { prospectIssue } from './prospect-form';

const INTENT = 'open-prospect';

/**
 * **Nouvelle enseigne** : une enseigne démarchée, qui n'est pas encore
 * cliente (une dégustation). Le compte s'ouvre en attente, son contact est
 * rattaché **sans e-mail** — rien ne part, il attend dans « Accès à
 * remettre » (décidé par Hugo le 2026-11-23). Le panneau se ferme en rendant
 * l'identifiant du compte, et la page ouvre sa saisie.
 */
@Component({
  selector: 'app-prospect-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './prospect-panel.html',
  styleUrl: './prospect-panel.scss',
})
export class ProspectPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  private readonly companies = inject(AdminCompaniesService);
  private readonly panel = inject(FoldPanelRef<string>);
  private readonly intents = new GestureIntents();

  protected readonly enseigne = signal('');
  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly issue = computed(() =>
    prospectIssue({
      enseigne: this.enseigne(),
      firstName: this.firstName(),
      lastName: this.lastName(),
      email: this.email(),
      phone: this.phone(),
    }),
  );
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
      const opened = await this.companies.create({
        intentKey: this.intents.keyFor(INTENT),
        identity: {
          raisonSociale: '',
          enseigne: this.enseigne().trim(),
          formeJuridique: '',
          siret: '',
          siren: '',
          vatNumber: '',
        },
        contact: {
          firstName: this.firstName().trim(),
          lastName: this.lastName().trim(),
          fonction: '',
          email: this.email().trim(),
          phone: this.phone().trim(),
          role: '',
        },
        announceHolder: false,
      });
      this.intents.done(INTENT);
      this.panel.close(opened.id);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'L’enseigne n’a pas pu être créée.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.panel.close();
  }
}

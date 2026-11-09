import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAIL_SEND_SPACES, type MailSendSpace } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { MAIL_SPACE_LABELS } from '@lfd/mail-blocks';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
  type FoldSelectOption,
} from 'fold-ng';

import { MailPreferencesService } from '../../data/mail-preferences.service';
import type { MailPreferencePanelResult } from '../mail-preference-panel/mail-preference-panel';

/**
 * **Désinscrire une adresse à la demande du client** (plan
 * `la-desinscription-et-l-accord.md`, règle 8, lot C4) : le client donne
 * son adresse, le staff choisit l'espace. L'adresse part dans le CORPS ; le
 * serveur répond de même pour toute adresse — connue du registre ou non, elle
 * y entre désinscrite — et inscrit le geste au journal, jamais l'adresse.
 */
@Component({
  selector: 'app-mail-unsubscribe-address-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './mail-unsubscribe-address-panel.html',
  styleUrl: './mail-unsubscribe-address-panel.scss',
})
export class MailUnsubscribeAddressPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'sm' };

  private readonly panel = inject<FoldPanelRef<MailPreferencePanelResult>>(FoldPanelRef);
  private readonly api = inject(MailPreferencesService);

  protected readonly spaceOptions: readonly FoldSelectOption<MailSendSpace>[] =
    MAIL_SEND_SPACES.map((space) => ({ value: space, label: MAIL_SPACE_LABELS[space] }));
  protected readonly space = signal<MailSendSpace | null>('lfc');
  protected readonly address = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly done = signal(false);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const space = this.space();
    const address = this.address().trim();
    if (space === null || address === '' || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.unsubscribeAddress(space, address);
      this.done.set(true);
      this.address.set('');
    } catch (error) {
      this.error.set(httpErrorMessage(error, 'La désinscription n’a pas abouti.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.panel.close(this.done() ? 'changed' : undefined);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type { VitrineSubscriberView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelDefaults,
} from 'fold-ng';

import { VitrineIdentityFields } from '../vitrine-identity-fields/vitrine-identity-fields';
import { VitrineWebhookService } from '../vitrine-webhook.service';
import { blankToNull, vitrineEndpointLabel, vitrineIdentityIssue } from '../vitrine-webhook-format';

/**
 * **Modifier un abonné** — son nom, sa description, son contact. Rien de tout
 * ça ne part chez l'agence : aucun envoi ne suit l'enregistrement.
 */
@Component({
  selector: 'app-vitrine-subscriber-edit-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    VitrineIdentityFields,
  ],
  templateUrl: './vitrine-subscriber-edit-panel.html',
  styleUrl: './vitrine-subscriber-edit-panel.scss',
})
export class VitrineSubscriberEditPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<VitrineSubscriberView>();

  private readonly api = inject(VitrineWebhookService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly endpointLabel = vitrineEndpointLabel;
  protected readonly name = linkedSignal(() => this.data().name);
  protected readonly description = linkedSignal(() => this.data().description ?? '');
  protected readonly contactEmail = linkedSignal(() => this.data().contactEmail ?? '');
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly issue = computed(() =>
    vitrineIdentityIssue({
      name: this.name(),
      description: this.description(),
      contactEmail: this.contactEmail(),
    }),
  );

  protected async submit(): Promise<void> {
    if (this.issue() !== '' || this.saving()) return;
    this.saving.set(true);
    this.refusal.set(null);
    try {
      await this.api.updateIdentity(this.data().id, {
        name: this.name().trim(),
        description: blankToNull(this.description()),
        contactEmail: blankToNull(this.contactEmail()),
      });
      this.panel.close('saved');
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'L’abonné n’a pas pu être modifié.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.panel.close(undefined);
  }
}

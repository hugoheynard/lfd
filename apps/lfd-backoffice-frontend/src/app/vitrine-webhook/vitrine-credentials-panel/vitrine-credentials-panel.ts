import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import type { VitrineCredentialsView, VitrineSubscriberView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { VitrineCredentials } from '../vitrine-credentials/vitrine-credentials';
import { VitrineWebhookService } from '../vitrine-webhook.service';

/**
 * **Régénérer le secret et la clé** d'un abonné. Les anciens cessent de valoir
 * à l'instant : l'agence refuse les envois suivants et ses lectures sont
 * refusées tant qu'elle n'a pas les neufs. C'est aussi le geste de sortie
 * après une rotation de la clé de chiffrement du serveur.
 */
@Component({
  selector: 'app-vitrine-credentials-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    VitrineCredentials,
  ],
  templateUrl: './vitrine-credentials-panel.html',
})
export class VitrineCredentialsPanel implements FoldPanelContent<VitrineSubscriberView> {
  static readonly foldPanel: FoldPanelDefaults = { side: 'center', width: 'md', surface: 'solid' };

  readonly data = input.required<VitrineSubscriberView>();

  private readonly api = inject(VitrineWebhookService);
  private readonly panel = inject(FoldPanelRef);

  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly rotated = signal<VitrineCredentialsView | null>(null);

  protected async rotate(): Promise<void> {
    this.saving.set(true);
    this.refusal.set(null);
    try {
      this.rotated.set(await this.api.rotate(this.data().id));
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le secret et la clé n’ont pas pu être régénérés.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected close(): void {
    this.panel.close(this.rotated() === null ? undefined : 'rotated');
  }
}

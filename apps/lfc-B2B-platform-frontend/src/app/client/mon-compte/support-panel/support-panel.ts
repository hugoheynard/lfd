import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FoldIconComponent, FoldPanelBodyComponent, FoldPanelHeaderComponent } from 'fold-ng';

import { ClientContent } from '../../client-content.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { supportChannels } from '../../support-channels';

/**
 * Le panneau **Service commercial** — ce que la carte bleue de `/mon-compte`
 * ouvre : le téléphone et l'adresse, en liens qu'on compose d'un pouce.
 *
 * Sans pied ni bouton : il n'y a rien à valider, et l'en-tête de fold porte
 * déjà la fermeture. Il lit le **contact commercial**, pas l'identité du pied
 * de page (2026-09-14), et ne s'ouvre qu'en pile : au bureau, la carte montre
 * déjà l'adresse.
 */
@Component({
  selector: 'app-support-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './support-panel.html',
  styleUrl: './support-panel.scss',
})
export class SupportPanel {
  protected readonly t = inject(ClientCopyService).t;
  private readonly contact = inject(ClientContent).commercialContact;

  protected readonly channels = computed(() => supportChannels(this.contact()));
}

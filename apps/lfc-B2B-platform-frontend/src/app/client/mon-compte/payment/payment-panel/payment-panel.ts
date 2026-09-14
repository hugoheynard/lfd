import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { ClientCopyService } from '../../../copy/client-copy.service';
import { panelSide } from '../../../panel-side';

/** Charge d'ouverture : le crédit fin de mois est-il ACCORDÉ à la société ? */
export interface PaymentPanelData {
  readonly deferred: boolean;
}

/**
 * Le panneau **Paiement** — les deux régimes, côte à côte, et la phrase qui
 * dit qu'il n'y en a pas de troisième.
 *
 * Deux et pas plus, lus ensemble : l'absence de crédit ne doit pas ressembler
 * à un refus. Le badge dit lequel est CONVENU — la maquette l'affirmait sans
 * regarder. Rien ne s'y écrit : un régime se convient avec le commercial.
 */
@Component({
  selector: 'app-payment-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './payment-panel.html',
  styleUrl: './payment-panel.scss',
})
export class PaymentPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'right', width: 'md', surface: 'solid' };

  static open(panels: FoldPanelHostService, deferred: boolean): void {
    panels.open(PaymentPanel, { side: panelSide(), data: { deferred } });
  }

  readonly data = input.required<PaymentPanelData>();

  protected readonly t = inject(ClientCopyService).t;
}

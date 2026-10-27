import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { ClientCopyService } from '../../copy/client-copy.service';
import { RetraitQr } from '../retrait-qr/retrait-qr';

/**
 * **Le QR de retrait, en panneau** — la forme de la pile (Hugo, 2026-10-27 :
 * « sur mobile cette page devrait s'ouvrir en panel »). On présente son écran
 * au comptoir sans quitter ses commandes ; le bureau garde la page.
 */
@Component({
  selector: 'app-retrait-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, RetraitQr],
  templateUrl: './retrait-panel.html',
})
export class RetraitPanel {
  /** Le fond plein des autres panneaux de commande. */
  static readonly foldPanel: FoldPanelDefaults = { side: 'bottom', width: 'lg', surface: 'solid' };

  /** La feuille du bas : il n'est ouvert qu'en pile. */
  static open(panels: FoldPanelHostService, orderId: string): FoldPanelRef<undefined> {
    return panels.open<string, undefined>(RetraitPanel, {
      side: 'bottom',
      data: orderId,
    });
  }

  /** L'identifiant de la commande. */
  readonly data = input.required<string>();

  protected readonly t = inject(ClientCopyService).t;
}

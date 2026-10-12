import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import type { OrderLineView } from '@lfd/contracts';
import {
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  type FoldPanelContent,
  type FoldPanelDefaults,
} from 'fold-ng';

import { PriceExplain } from '../price-explain/price-explain';

/** La ligne à expliquer, et la commande dont elle vient (la reconstruction se lit par sa date). */
export interface PriceExplainPanelData {
  readonly line: OrderLineView;
  readonly orderId: string;
}

/**
 * **« Pourquoi ce prix », en panneau latéral** — le même contenu que
 * `app-price-explain`, ouvert par `FoldPanelHostService` comme le bon de
 * commande du comptoir (`handover-shop/sheet-panel`).
 *
 * Il s'ouvrait en bas de la page, sous l'historique : hors de vue au moment du
 * clic (Hugo, 2026-10-12). Le panneau occupe la fenêtre dès le geste, et la
 * commande reste derrière lui.
 */
@Component({
  selector: 'app-price-explain-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, PriceExplain],
  templateUrl: './price-explain-panel.html',
})
export class PriceExplainPanel implements FoldPanelContent<PriceExplainPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { width: 'lg' };

  readonly data = input<PriceExplainPanelData | undefined>();

  private readonly panel = inject(FoldPanelRef);

  /** La croix du chemin du prix ferme le panneau : un seul geste, comme avant. */
  protected close(): void {
    this.panel.close();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  FoldButtonComponent,
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { CartBar } from '../../cart/cart-bar/cart-bar';
import { serviceChangeCopy } from '../../copy/screens/service-change.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { dialogSide } from '../../panel-side';
import { ORDER_DIALOG } from '../order-dialog';

/** Ce qu'on choisit de changer. */
export type ServiceChange = 'mode' | 'date' | 'time' | 'place' | 'address';

/** Ce que le panneau doit savoir de la commande située. */
export interface ServiceChangeData {
  readonly mode: 'pickup' | 'delivery';
  /** L'autre mode est-il ouvert à qui regarde ? Sinon, pas de bascule. */
  readonly otherOpen: boolean;
  /** Plusieurs maisons servent : le point de retrait se change. */
  readonly severalPlaces: boolean;
}

/**
 * **« Modifier »** — l'aiguillage vers ce qu'on change d'une commande déjà
 * située (Hugo, 2026-10-27 : « tout me ramène à l'étape 2 »). Chaque bouton
 * mène à SON étape, et seulement à elle.
 */
@Component({
  selector: 'app-service-change-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CartBar, FoldButtonComponent, FoldPanelBodyComponent, FoldPanelHeaderComponent],
  templateUrl: './service-change-dialog.html',
  styleUrl: './service-change-dialog.scss',
})
export class ServiceChangeDialog {
  static readonly foldPanel: FoldPanelDefaults = ORDER_DIALOG;

  /** Rend ce qu'on veut changer, ou `undefined` — fermer ne change rien. */
  static open(
    panels: FoldPanelHostService,
    data: ServiceChangeData,
  ): FoldPanelRef<ServiceChange | undefined> {
    return panels.open<ServiceChangeData, ServiceChange | undefined>(ServiceChangeDialog, {
      side: dialogSide(),
      stack: true,
      data,
    });
  }

  readonly data = input.required<ServiceChangeData>();

  private readonly ref = inject(FoldPanelRef);

  protected readonly c = screenCopy('serviceChange', serviceChangeCopy);

  protected readonly pickup = computed(() => this.data().mode === 'pickup');

  protected pick(change: ServiceChange): void {
    this.ref.close(change);
  }
}

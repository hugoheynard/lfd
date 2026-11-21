import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldPanelBodyComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import {
  PARTICULAR_ORDER_LINK,
  PRO_ORDER_LINK,
} from '../../comptoir/order-kind-choice-page/order-kind-choice-page';

/**
 * **Nouvelle commande, depuis la liste** : le même choix que la page du
 * comptoir (`OrderKindChoicePage`) — pro ou particulier —, ouvert en panneau
 * pour qu'on ne quitte la liste qu'une fois le cas choisi. Chaque carte mène à
 * la saisie de son cas ; les deux ne se mélangent pas.
 */
@Component({
  selector: 'app-new-order-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldPanelBodyComponent,
    FoldPanelHeaderComponent,
  ],
  templateUrl: './new-order-dialog.html',
  styleUrl: './new-order-dialog.scss',
})
export class NewOrderDialog {
  private readonly ref = inject(FoldPanelRef<void>);
  private readonly router = inject(Router);

  protected readonly pro = PRO_ORDER_LINK;
  protected readonly particular = PARTICULAR_ORDER_LINK;

  protected go(link: string): void {
    this.ref.close();
    void this.router.navigateByUrl(link);
  }
}

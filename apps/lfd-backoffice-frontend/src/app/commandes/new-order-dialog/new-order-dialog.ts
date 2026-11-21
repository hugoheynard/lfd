import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
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
import { orderEntryParams } from '../nouvelle-commande/order-entry-return';

/**
 * **Nouvelle commande** : le même choix que la page de la saisie
 * (`OrderKindChoicePage`) — pro ou particulier —, en dialogue, ouvert depuis
 * la liste des commandes ou la bande du comptoir. Chaque carte ouvre la saisie
 * de son cas en notant l'origine (et le point du comptoir) : « Terminer » y
 * ramène.
 */
/** D'où le dialogue est ouvert : l'origine, et le point du comptoir s'il y en a un. */
export interface NewOrderDialogData {
  readonly origin: string;
  readonly point: string | null;
}

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
  readonly data = input<NewOrderDialogData>({ origin: '/commandes', point: null });

  private readonly ref = inject(FoldPanelRef<void>);
  private readonly router = inject(Router);

  protected readonly pro = PRO_ORDER_LINK;
  protected readonly particular = PARTICULAR_ORDER_LINK;

  protected go(link: string): void {
    this.ref.close();
    const { origin, point } = this.data();
    void this.router.navigate([link], { queryParams: orderEntryParams(origin, point) });
  }
}

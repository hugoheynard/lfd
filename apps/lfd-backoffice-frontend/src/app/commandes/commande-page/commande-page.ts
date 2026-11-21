import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import type { AdminOrderView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldSurfaceDirective,
  FoldTabsComponent,
} from 'fold-ng';

import { cameFromOrderList } from '../order-list-return';
import { OrderMasthead } from '../order-masthead/order-masthead';
import { OrderReviseAction } from '../order-revise-action/order-revise-action';
import { ORDER_VIEW_TABS, injectOrderViewTab } from '../order-view-tabs';
import { OrderViewComponent } from '../order-view/order-view';

/**
 * **Une commande, en pleine page** — le cadre, et rien d'autre : la bande de
 * tête (le retour, puis `app-order-masthead`), et le corps à onglets.
 *
 * Le corps vit dans `app-order-view`, parce que l'espace d'un compte l'affiche
 * aussi, sous SON bandeau. Cette page reste la route de premier niveau : c'est
 * la seule qui couvre les commandes « zéro friction », qui n'ont pas
 * d'entreprise, donc pas de fiche où les loger.
 *
 * Son retour mène à la liste de toutes les commandes (`/commandes`, lot C2), en
 * gardant ses filtres quand on en vient — cf. `order-list-return.ts`. Il menait
 * aux comptes clients, ce qui n'avait de sens que tant que la liste n'existait
 * pas.
 */
@Component({
  selector: 'app-admin-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldSurfaceDirective,
    FoldTabsComponent,
    OrderMasthead,
    OrderReviseAction,
    OrderViewComponent,
  ],
  templateUrl: './commande-page.html',
  styleUrl: './commande-page.scss',
})
export class AdminCommandePage {
  /** L'identifiant de la commande, lié depuis le segment de route. */
  readonly orderId = input.required<string>();

  /**
   * Lu une fois, à l'ouverture : l'état de la navigation en cours, ou celui de
   * l'historique quand la page est rechargée (le navigateur le garde).
   */
  protected readonly fromList = cameFromOrderList(
    inject(Router).currentNavigation()?.extras.state ?? inject(Location).getState(),
  );

  protected readonly order = signal<AdminOrderView | null>(null);

  /** La barre d'onglets vit dans la bande ; l'onglet ouvert, dans l'adresse. */
  protected readonly tabs = ORDER_VIEW_TABS;
  protected readonly tabState = injectOrderViewTab();

  protected onLoaded(order: AdminOrderView): void {
    this.order.set(order);
  }
}

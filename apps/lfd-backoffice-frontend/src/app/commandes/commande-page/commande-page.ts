import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import type { OrderView } from '@lfd/contracts';
import { FoldBackLinkComponent, FoldPageLayoutComponent } from 'fold-ng';

import { cameFromOrderList } from '../order-list-return';
import { OrderViewComponent } from '../order-view/order-view';

/**
 * **Une commande, en pleine page** — le cadre, et rien d'autre.
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
  imports: [FoldBackLinkComponent, FoldPageLayoutComponent, OrderViewComponent],
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

  private readonly order = signal<OrderView | null>(null);

  /** La RÉFÉRENCE dans le bandeau : c'est elle qu'on dicte au téléphone. */
  protected readonly title = computed(() => this.order()?.orderNumber ?? 'Commande');

  protected onLoaded(order: OrderView): void {
    this.order.set(order);
  }
}

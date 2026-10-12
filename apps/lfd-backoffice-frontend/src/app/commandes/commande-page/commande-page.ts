import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import type { AdminOrderView } from '@lfd/contracts';
import { FoldBackLinkComponent, FoldPageLayoutComponent } from 'fold-ng';

import { OrderDetailHeaderComponent } from '../order-detail-header/order-detail-header';
import { orderHeader } from '../order-header';
import { cameFromOrderList } from '../order-list-return';
import { OrderPlacedByComponent } from '../order-placed-by/order-placed-by';
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
  imports: [
    FoldBackLinkComponent,
    FoldPageLayoutComponent,
    OrderDetailHeaderComponent,
    OrderPlacedByComponent,
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

  /**
   * L'en-tête du détail : la RÉFÉRENCE (c'est elle qu'on dicte au téléphone),
   * puis le mode et son jour, puis le client, et le badge Pro / Particulier
   * quand la commande le porte (`AdminOrderView.clientele`). La ligne « icône +
   * numéro » du bandeau a été retirée (Hugo, 2026-10-12) : le numéro vit ici.
   */
  protected readonly header = computed(() => {
    const order = this.order();
    return order === null ? null : orderHeader(order);
  });

  protected onLoaded(order: AdminOrderView): void {
    this.order.set(order);
  }
}

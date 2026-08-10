import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import type { OrderView } from '@lfd/contracts';
import { canSettle, OrderDetail } from '@lfd/b2b-ui/order';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
  FoldSpinnerComponent,
} from 'fold-ng';

import { PRODUCTS } from '../../data/catalogue-seed';
import { NotifyService } from '../../notify.service';
import { OrdersService } from '../orders.service';
import { RecurringOrderPanel } from '../recurring-order-panel/recurring-order-panel';

/** Où en est le chargement de LA commande affichée. */
type PageState = 'loading' | 'ready' | 'error';

/**
 * Page **détail d'une commande** du client. La présentation vient en entier de
 * `lfd-order-detail` (`@lfd/b2b-ui/order`) : cet écran ne fait que charger la
 * commande, projeter les actions **du client**, et gérer les états de page.
 *
 * Le commercial aura la sienne, avec les mêmes blocs et d'autres actions — c'est
 * exactement pour ça que la présentation est dans la lib et pas ici.
 */
@Component({
  selector: 'app-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldButtonComponent, FoldSpinnerComponent, OrderDetail],
  templateUrl: './commande-page.html',
  styleUrl: './commande-page.scss',
})
export class CommandePage {
  private readonly route = inject(ActivatedRoute);
  private readonly orders = inject(OrdersService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /** L'identifiant lu du segment de route (l'app ne lie pas les inputs de route). */
  private readonly id = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );

  protected readonly state = signal<PageState>('loading');
  protected readonly error = signal<string>('');
  protected readonly order = signal<OrderView | null>(null);

  /**
   * Les noms de produits du catalogue, pour nommer les lignes **retirées** d'une
   * échéance récurrente : elles ne portent qu'un SKU. Construit une fois — le
   * catalogue est un module semé, pas un chargement.
   */
  protected readonly nameBySku: ReadonlyMap<string, string> = new Map(
    PRODUCTS.map((product) => [product.id, product.name]),
  );

  /** Le titre de page : le numéro dès qu'on l'a, un mot générique avant. */
  protected readonly heading = computed<string>(() => this.order()?.orderNumber ?? 'Commande');

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.order.set(await this.orders.byId(this.id()));
      this.state.set('ready');
    } catch (error: unknown) {
      this.error.set(httpErrorMessage(error));
      this.state.set('error');
    }
  }

  /** Le règlement est encore à faire — le bouton n'apparaît que dans ce cas. */
  protected settlable(order: OrderView): boolean {
    return canSettle(order.paymentStatus);
  }

  /** Règlement d'une commande — endpoint de settle par commande à câbler (à venir). */
  protected settle(order: OrderView): void {
    this.notify.info(`Le règlement en ligne de ${order.orderNumber} arrive bientôt.`);
  }

  /** Ouvre « transformer en panier récurrent » avec cette commande. */
  protected makeRecurring(order: OrderView): void {
    this.panelHost.open(RecurringOrderPanel, { data: order });
  }

  protected async back(): Promise<void> {
    await this.router.navigate(['/commandes']);
  }
}

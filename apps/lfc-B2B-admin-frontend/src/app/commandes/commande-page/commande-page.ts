import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { OrderView } from '@lfd/contracts';
import { OrderDetail, orderDocuments, type OrderDocument } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { AdminOrdersService } from '../orders.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Une commande, vue du commercial.** La présentation est celle du client, au
 * pixel près (`lfd-order-detail`) — c'est le point : au téléphone, les deux
 * doivent lire le même écran, sinon la conversation porte sur ce que chacun voit
 * plutôt que sur la commande.
 *
 * Ce qui diffère tient dans le rail d'actions, et pour l'instant il est **vide** :
 * faire avancer une commande ou l'annuler sont des décisions de production, pas
 * des boutons d'écran. Elles arriveront avec les avenants, avec leurs règles.
 */
@Component({
  selector: 'app-admin-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    OrderDetail,
    FoldEmptyStateComponent,
  ],
  templateUrl: './commande-page.html',
  styleUrl: './commande-page.scss',
})
export class AdminCommandePage {
  /** L'identifiant de la commande, lié depuis le segment de route. */
  readonly id = input.required<string>();

  private readonly api = inject(AdminOrdersService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly order = signal<OrderView | null>(null);

  protected readonly documents = computed<readonly OrderDocument[]>(() => {
    const order = this.order();
    return order === null ? [] : orderDocuments(order);
  });

  constructor() {
    // L'`input` de route n'est pas encore lié dans le constructeur, et il change
    // si on passe d'une commande à l'autre sans quitter la page.
    effect(() => {
      void this.load(this.id());
    });
  }

  protected async load(id: string = this.id()): Promise<void> {
    this.state.set('loading');
    try {
      this.order.set(await this.api.byId(id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /**
   * Le bon de livraison est généré côté client ; la facture n'existe pas encore
   * et la lib la rend indisponible. Le staff n'a donc rien de plus à télécharger
   * que le client — et surtout rien qu'il croirait avoir.
   */
  protected onDocument(): void {
    this.notify.info('Le téléchargement des documents arrive avec la facturation.');
  }

  protected async back(): Promise<void> {
    await this.router.navigate(['/comptes-clients']);
  }
}

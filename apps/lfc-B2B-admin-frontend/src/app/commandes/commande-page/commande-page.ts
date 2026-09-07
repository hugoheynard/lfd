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
import { isOrderSheet } from './order-sheet-key';
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
   * Ce que le bureau peut emporter d'une commande.
   *
   * 🔴 Cette méthode répondait « le téléchargement arrive avec la facturation »
   * — vrai de la facture, faux du bon de commande depuis qu'il existe en PDF.
   * Le staff n'a effectivement RIEN de plus que le client, et c'est délibéré :
   * ce qu'il télécharge est le **même document**, sous la même clé d'archive.
   * Si le client l'a déjà tiré, c'est sa copie qui s'ouvre — et c'est ce qui
   * permet de discuter le même papier au téléphone.
   *
   * La facture, elle, garde son message : elle n'existe toujours pas, et la lib
   * la rend indisponible pour cette raison.
   */
  protected onDocument(key: string): void {
    if (!isOrderSheet(key)) {
      this.notify.info('La facture arrive avec la facturation.');
      return;
    }
    // Le gabarit appelle une méthode SYNCHRONE : une liaison Angular n'attend
    // pas une promesse, et la lui rendre en laisserait une flotter sans que
    // personne n'attrape son échec.
    void this.downloadSheet();
  }

  /** Va chercher le bon, le propose, et **dit** quand il ne vient pas. */
  private async downloadSheet(): Promise<void> {
    const order = this.order();
    if (order === null) {
      return;
    }
    try {
      const pdf = await this.api.sheetPdf(order.id);
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      // Le nom se compose sur la RÉFÉRENCE — celle qu'on lit au téléphone, et
      // qu'on cherchera dans un dossier de téléchargements.
      link.download = `bon-de-commande-${order.orderNumber}.pdf`;
      link.click();
      // Révoqué après coup : sans ça chaque téléchargement fuiterait son blob
      // jusqu'au rechargement de la page.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      this.notify.error("Le bon de commande n'a pas pu être téléchargé.");
    }
  }

  protected async back(): Promise<void> {
    await this.router.navigate(['/commercial/comptes-clients']);
  }
}

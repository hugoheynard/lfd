import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { AdminOrderView } from '@lfd/contracts';
import { OrderDetail, orderDocuments, type OrderDocument } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { HandoverProofCard } from '../handover-proof-card/handover-proof-card';
import { OrderCancelComponent } from '../order-cancel/order-cancel';
import { OrderReviseAction } from '../order-revise-action/order-revise-action';
import { OrderHistoryCard } from '../order-history-card/order-history-card';
import { OrderRevisionsCard } from '../order-revisions-card/order-revisions-card';
import { OrderSalesTermsCard } from '../order-sales-terms-card/order-sales-terms-card';
import { OrderDeliveryNotesCard } from '../order-delivery-notes-card/order-delivery-notes-card';
import { OrderInvoicesCard } from '../order-invoices-card/order-invoices-card';
import { OrderRefundBanner } from '../order-refund-banner/order-refund-banner';
import { OrderShortfallBanner } from '../order-shortfall-banner/order-shortfall-banner';
import { OrderShortfallDecision } from '../order-shortfall-decision/order-shortfall-decision';
import { OrderRefundsCard } from '../order-refunds-card/order-refunds-card';
import { isOrderSheet } from '../commande-page/order-sheet-key';
import { AdminOrdersService } from '../orders.service';
import {
  PriceExplainPanel,
  type PriceExplainPanelData,
} from '../price-explain-panel/price-explain-panel';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Une commande, vue du commercial** — le CORPS de l'écran, sans son cadre.
 *
 * La présentation est celle du client, au pixel près (`lfd-order-detail`) :
 * c'est le point, au téléphone les deux doivent lire le même écran, sinon la
 * conversation porte sur ce que chacun voit plutôt que sur la commande.
 *
 * Sans cadre, parce qu'une commande se regarde depuis **deux endroits** qui
 * n'ont pas le même bandeau : la route de premier niveau, qui couvre aussi les
 * commandes « zéro friction » sans société, et l'espace d'un compte, où le
 * bandeau et les onglets appartiennent déjà à la coquille. Un composant qui
 * porterait son cadre en aurait posé un second dans le second cas — et un
 * `@if` sur « suis-je encadré » aurait donné deux raisons de changer au même
 * fichier.
 */
@Component({
  selector: 'app-order-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldLoadingStateComponent,
    FoldEmptyStateComponent,
    HandoverProofCard,
    OrderCancelComponent,
    OrderReviseAction,
    OrderDetail,
    OrderHistoryCard,
    OrderRevisionsCard,
    OrderSalesTermsCard,
    OrderDeliveryNotesCard,
    OrderInvoicesCard,
    OrderRefundBanner,
    OrderShortfallBanner,
    OrderShortfallDecision,
    OrderRefundsCard,
  ],
  templateUrl: './order-view.html',
})
export class OrderViewComponent {
  /** L'identifiant de la commande, lié depuis le segment de route. */
  readonly orderId = input.required<string>();

  /**
   * La commande, une fois lue — pour le cadre qui entoure cette vue.
   *
   * Le corps la charge, donc lui seul sait quand elle arrive ; le bandeau de la
   * page en porte la RÉFÉRENCE dans son titre, et la lui faire charger une
   * seconde fois pour un mot serait deux requêtes pour un écran.
   */
  readonly loaded = output<AdminOrderView>();

  private readonly api = inject(AdminOrdersService);
  private readonly notify = inject(NotifyService);
  private readonly panels = inject(FoldPanelHostService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly order = signal<AdminOrderView | null>(null);
  /** Avancé après une décision de départ : la carte des BL se relit (plan E6, § 14). */
  protected readonly notesRefresh = signal(0);

  /**
   * Ouvre « pourquoi ce prix » dans un panneau latéral, au-dessus de la page.
   *
   * Il se dépliait sous l'historique, hors de vue au moment du clic (Hugo,
   * 2026-10-12). Le SKU identifie la ligne : une commande ne porte jamais deux
   * lignes du même article (la passation les fusionne). Le panneau se referme
   * seul — croix d'en-tête, croix du chemin, Échap.
   */
  protected explain(sku: string): void {
    const order = this.order();
    const line = order?.lines.find((candidate) => candidate.sku === sku);
    if (order === null || line === undefined) {
      return;
    }
    const data: PriceExplainPanelData = { line, orderId: order.id };
    this.panels.open<PriceExplainPanelData>(PriceExplainPanel, { data });
  }

  protected readonly documents = computed<readonly OrderDocument[]>(() => {
    const order = this.order();
    return order === null ? [] : orderDocuments(order);
  });

  constructor() {
    // L'`input` de route n'est pas encore lié dans le constructeur, et il change
    // si on passe d'une commande à l'autre sans quitter la page.
    effect(() => {
      void this.load(this.orderId());
    });
  }

  /** Le départ est décidé : la commande et ses BL se relisent. */
  protected onShortfallDecided(): void {
    this.notesRefresh.update((count) => count + 1);
    void this.load();
  }

  protected async load(id: string = this.orderId()): Promise<void> {
    this.state.set('loading');
    try {
      const order = await this.api.byId(id);
      this.order.set(order);
      this.loaded.emit(order);
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
      link.download = `confirmation-de-commande-${order.orderNumber}.pdf`;
      link.click();
      // Révoqué après coup : sans ça chaque téléchargement fuiterait son blob
      // jusqu'au rechargement de la page.
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 60_000);
    } catch {
      this.notify.error("La confirmation de commande n'a pas pu être téléchargée.");
    }
  }
}

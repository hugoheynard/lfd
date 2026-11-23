import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { orderOfferNatureLabel, type AdminOrderView } from '@lfd/contracts';
import { OrderDetail, OrderDetailHead } from '@lfd/b2b-ui/order';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
  FoldTabPanelComponent,
  FoldTabsComponent,
} from 'fold-ng';

import { OrderCancelComponent } from '../order-cancel/order-cancel';
import { OrderNoShow } from '../order-no-show/order-no-show';
import { OrderPlacedByComponent, entryStepOf } from '../order-placed-by/order-placed-by';
import { OrderCardIncreaseBanner } from '../order-card-increase-banner/order-card-increase-banner';
import { OrderReviseAction } from '../order-revise-action/order-revise-action';
import { OrderReviewCard } from '../order-review-card/order-review-card';
import { OrderHistoryCard } from '../order-history-card/order-history-card';
import { OrderRevisionsCard } from '../order-revisions-card/order-revisions-card';
import { OrderDocumentsPanel } from '../order-documents-panel/order-documents-panel';
import { OrderMailsStore } from '../order-mails.store';
import { OrderBudgetCommitmentCard } from '../order-budget-commitment-card/order-budget-commitment-card';
import { OrderRefundBanner } from '../order-refund-banner/order-refund-banner';
import { OrderShortfallBanner } from '../order-shortfall-banner/order-shortfall-banner';
import { OrderShortfallDecision } from '../order-shortfall-decision/order-shortfall-decision';
import { OrderShortfallLetter } from '../order-shortfall-letter/order-shortfall-letter';
import {
  OrderItemLimitOverridesCard,
  limitOverrideBadges,
} from '../order-item-limit-overrides-card/order-item-limit-overrides-card';
import { OrderRefundsCard } from '../order-refunds-card/order-refunds-card';
import { ORDER_VIEW_TABS, injectOrderViewTab, type OrderViewTab } from '../order-view-tabs';
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
    OrderDocumentsPanel,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldEmptyStateComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    OrderCancelComponent,
    OrderNoShow,
    OrderPlacedByComponent,
    OrderCardIncreaseBanner,
    OrderReviseAction,
    OrderReviewCard,
    OrderDetail,
    OrderDetailHead,
    OrderHistoryCard,
    OrderRevisionsCard,
    OrderBudgetCommitmentCard,
    OrderRefundBanner,
    OrderShortfallBanner,
    OrderShortfallDecision,
    OrderShortfallLetter,
    OrderItemLimitOverridesCard,
    OrderRefundsCard,
  ],
  // Une lecture des e-mails par fiche ouverte, partagée par la carte et la lettre de manque.
  providers: [OrderMailsStore],
  templateUrl: './order-view.html',
  styleUrl: './order-view.scss',
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

  /**
   * **L'en-tête de la commande ouvre-t-il ce corps ?** Vrai par défaut.
   *
   * La route de premier niveau le porte dans sa bande de tête et le tait ici ;
   * sous la fiche d'un compte, la bande est celle du compte, et l'en-tête ouvre
   * le corps.
   */
  readonly showHead = input(true);

  /**
   * **La barre d'onglets, quand une autre la porte.** La route de premier
   * niveau la rend dans sa bande de tête et la passe ici : les panneaux s'y
   * accrochent. `null` (la fiche d'un compte, sans bande à elle) : la vue rend
   * la sienne. Dans les deux cas, l'onglet ouvert est dans l'adresse.
   */
  readonly tabBar = input<FoldTabsComponent<OrderViewTab> | null>(null);

  protected readonly tabs = ORDER_VIEW_TABS;
  /** « Dégustation », « Événement »… — le libellé d'une nature d'offre. */
  protected readonly offerNatureLabel = orderOfferNatureLabel;
  protected readonly tabState = injectOrderViewTab();
  private readonly ownBar = viewChild<FoldTabsComponent<OrderViewTab>>('ownBar');
  /** La barre à laquelle les panneaux s'accrochent : celle de la page, ou la sienne. */
  protected readonly bar = computed(() => this.tabBar() ?? this.ownBar() ?? null);

  /** SKU → « hors délai » : la ligne de la composition dont la limite a été passée. */
  protected readonly limitBadges = computed(() =>
    limitOverrideBadges(this.order()?.itemLimitOverrides),
  );

  /** Qui a pris la commande — la première étape de l'avancement. */
  protected readonly entryStep = computed(() => {
    const order = this.order();
    return order === null ? null : entryStepOf(order);
  });

  private readonly api = inject(AdminOrdersService);
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
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { ResupplyArticleView, ResupplyReceiptView } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';
import { ResupplyOrderCard } from './resupply-order-card/resupply-order-card';
import { ResupplyReceiptsService } from './resupply-receipts.service';
import { ResupplyReceptionsCard } from './resupply-receptions-card/resupply-receptions-card';
import { SiteResuppliesStore } from './site-resupplies.store';
import { SiteStockAlertsStore } from './site-stock-alerts.store';
import { StockAlertActions } from './stock-alert-actions/stock-alert-actions';
import { StockAlertsCard } from './stock-alerts-card/stock-alerts-card';
import { UnorderedReceiptCard } from './unordered-receipt-card/unordered-receipt-card';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le réassort boutique** — ce que la vitrine d'un point de retrait a reçu
 * pour une journée, et le stock estimé qui en découle (plan
 * `limites-de-commande/plan-jour-meme-sur-stock.md`, J1, 2026-10-21).
 *
 * Depuis le lot R1 (`reassort-boutiques/plan-reapprovisionnement.md` §12,
 * 2026-10-21), la page commande aussi le réassort au fournil
 * (`ResupplyOrderCard`), au-dessus de la réception, qui ne change pas (R2 la
 * refera).
 *
 * Depuis le lot R1b (2026-10-21), la page déclare aussi les ruptures et
 * stocks faibles du point (`StockAlertsCard` en tête, et les gestes sur
 * chaque ligne reçue) ; un article reçu lève son alerte côté serveur, d'où la
 * relecture des alertes après chaque geste de réception.
 *
 * Depuis le lot R1c (2026-10-21), la demande de réassort en cours est
 * enregistrée et partagée par `SiteResuppliesStore` : la carte « Commander
 * au fournil » la remplit et l'envoie, et chaque alerte propose d'y ajouter
 * son article « au plus tôt ».
 *
 * Depuis le lot R2 (2026-10-21), la réception se fait en UN geste par
 * réassort envoyé (`ResupplyReceptionsCard`) ; la saisie ligne par ligne
 * devient le « réassort sans commande » (`UnorderedReceiptCard`), replié en
 * bas ; et le stock estimé du jour est la SOMME des reçus, tous confondus.
 * Les gestes vivent dans les deux cartes ; la page relit tout après chacun.
 *
 * Le stock estimé est le reçu tant que le circuit « jour même sur stock »
 * n'existe pas (J2) : les commandes déjà passées pour ce jour l'ont été la
 * veille, le fournil les a fabriquées pour elles, et elles ne puisent pas dans
 * la vitrine. Lecture sous `handover_counter:read`, gestes sous `:write`.
 *
 * 🔴 **Le point est celui de la bande du comptoir** (Hugo, 2026-10-21 :
 * « réassort Labo si switch Labo, Village si switch sur Village »). La page
 * n'a plus de sélecteur à elle : elle lit `HandoverQueueStore.activePlace`,
 * la même source que la file de retrait, et se relit quand il change. La
 * journée aussi est celle de la bande (ses flèches), pour la même raison. Deux
 * sélecteurs auraient pu dire deux points différents sur le même écran.
 */
@Component({
  selector: 'app-reassort-boutique-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    ResupplyOrderCard,
    ResupplyReceptionsCard,
    StockAlertActions,
    StockAlertsCard,
    UnorderedReceiptCard,
  ],
  providers: [SiteStockAlertsStore, SiteResuppliesStore],
  templateUrl: './reassort-boutique-page.html',
  styleUrl: './reassort-boutique-page.scss',
})
export class ReassortBoutiquePage {
  private readonly service = inject(ResupplyReceiptsService);
  private readonly counter = inject(HandoverQueueStore);
  private readonly permissions = inject(PermissionsStore);
  private readonly alerts = inject(SiteStockAlertsStore);

  protected readonly canWrite = computed(() => this.permissions.can('handover_counter:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly articles = signal<readonly ResupplyArticleView[]>([]);
  /** Le point ouvert dans la bande ; `null` tant qu'aucun site n'y est choisi. */
  protected readonly place = this.counter.activePlace;
  protected readonly siteId = computed(() => this.place()?.id ?? null);
  /** Les sites sont-ils lus ? Sans eux, « aucun point » ne se conclut pas. */
  protected readonly placesLoaded = this.counter.placesLoaded;
  /** « Réassort Labo » — le titre nomme le point que la bande a ouvert. */
  protected readonly title = computed(() => {
    const place = this.place();
    return place === null ? 'Réassort' : `Réassort ${place.label}`;
  });
  /** La journée des flèches du bandeau : une seule source de journée sur l'écran. */
  protected readonly day = this.counter.day;
  protected readonly receipt = signal<ResupplyReceiptView | null>(null);
  protected readonly refreshFailed = signal(false);
  /** Le stock estimé du jour : la somme des reçus. */
  protected readonly stock = computed(() => this.receipt()?.stock ?? []);

  /** Le catalogue est lu une fois ; changer de point ne le relit pas. */
  private articlesLoaded = false;

  constructor() {
    // Un changement de point dans la bande relit la liste — et seulement lui.
    effect(() => {
      this.siteId();
      this.day();
      untracked(() => void this.start());
    });
  }

  /** Le catalogue (une fois), puis la liste du point ouvert dans la bande. */
  protected async start(): Promise<void> {
    this.state.set('loading');
    this.refreshFailed.set(false);
    try {
      if (!this.articlesLoaded) {
        this.articles.set(await this.service.articles());
        this.articlesLoaded = true;
      }
      await this.reload();
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Une carte a fait un geste : tout se relit, alertes comprises (une réception les lève). */
  protected async refresh(): Promise<void> {
    this.refreshFailed.set(false);
    try {
      await this.reload();
    } catch {
      // Le geste est enregistré ; seule la relecture a échoué : la page garde ce qu'elle a.
      this.refreshFailed.set(true);
    }
  }

  private async reload(): Promise<void> {
    const siteId = this.siteId();
    const day = this.day();
    const [receipt] = await Promise.all([
      siteId === null ? null : this.service.read(siteId, day),
      this.alerts.load(siteId),
    ]);
    // Une réponse d'un point ou d'un jour quitté entre-temps est jetée.
    if (siteId === this.siteId() && day === this.day()) {
      this.receipt.set(receipt);
    }
  }
}

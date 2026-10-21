import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type {
  ResupplyArticleView,
  ResupplyReceiptLineView,
  ResupplyReceiptView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldComboboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';
import { ResupplyOrderCard } from './resupply-order-card/resupply-order-card';
import { ResupplyReceiptsService } from './resupply-receipts.service';
import { SiteResuppliesStore } from './site-resupplies.store';
import { SiteStockAlertsStore } from './site-stock-alerts.store';
import { StockAlertActions } from './stock-alert-actions/stock-alert-actions';
import { StockAlertsCard } from './stock-alerts-card/stock-alerts-card';

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
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldComboboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
    ResupplyOrderCard,
    StockAlertActions,
    StockAlertsCard,
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
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** Ce que l'on s'apprête à ajouter : un article choisi, une quantité. */
  protected readonly pickedSku = signal<string | null>(null);
  protected readonly pickedQuantity = signal<number | null>(null);
  /** Les quantités en cours de correction, par SKU. */
  protected readonly drafts = signal<ReadonlyMap<string, number | null>>(new Map());

  protected readonly lines = computed(() => this.receipt()?.lines ?? []);
  /** Les articles du catalogue qui ne sont pas encore sur la liste. */
  protected readonly addableOptions = computed<FoldSelectOption<string>[]>(() => {
    const present = new Set(this.lines().map((line) => line.sku));
    return this.articles()
      .filter((article) => !present.has(article.sku))
      .map((article) => ({ value: article.sku, label: `${article.name} · ${article.sku}` }));
  });
  protected readonly canAdd = computed(
    () => this.pickedSku() !== null && (this.pickedQuantity() ?? -1) >= 0 && !this.pending(),
  );

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
    this.failure.set(null);
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

  protected draftOf(line: ResupplyReceiptLineView): number | null {
    const draft = this.drafts().get(line.sku);
    return draft === undefined ? line.receivedQuantity : draft;
  }

  protected setDraft(sku: string, quantity: number | null): void {
    this.drafts.update((drafts) => new Map(drafts).set(sku, quantity));
  }

  protected changed(line: ResupplyReceiptLineView): boolean {
    const draft = this.draftOf(line);
    return draft !== null && draft !== line.receivedQuantity;
  }

  protected async add(): Promise<void> {
    const sku = this.pickedSku();
    const quantity = this.pickedQuantity();
    if (sku === null || quantity === null) {
      return;
    }
    await this.act((siteId, day) => this.service.receive(siteId, day, sku, quantity));
    if (this.failure() === null) {
      this.pickedSku.set(null);
      this.pickedQuantity.set(null);
    }
  }

  protected async correct(line: ResupplyReceiptLineView): Promise<void> {
    const quantity = this.draftOf(line);
    if (quantity === null) {
      return;
    }
    await this.act((siteId, day) => this.service.correct(siteId, day, line.sku, quantity));
  }

  protected async withdraw(line: ResupplyReceiptLineView): Promise<void> {
    await this.act((siteId, day) => this.service.withdraw(siteId, day, line.sku));
  }

  /** Un geste, puis la relecture. Un refus laisse la liste servie, avec sa raison. */
  private async act(gesture: (siteId: string, day: string) => Promise<void>): Promise<void> {
    const siteId = this.siteId();
    if (siteId === null || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await gesture(siteId, this.day());
      await this.reload();
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le geste n'a pas pu être enregistré."));
    } finally {
      this.pending.set(false);
    }
  }

  private async reload(): Promise<void> {
    const siteId = this.siteId();
    const day = this.day();
    this.drafts.set(new Map());
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

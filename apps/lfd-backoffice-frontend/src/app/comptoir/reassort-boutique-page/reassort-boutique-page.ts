import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type {
  PickupAddressView,
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
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldPageLayoutComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { PickupAddressesService } from '../../b2b/reglages/pickup-addresses.service';
import { parisToday } from '../../shared/paris-today';
import { ResupplyReceiptsService } from './resupply-receipts.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le réassort boutique** — ce que la vitrine d'un point de retrait a reçu
 * pour une journée, et le stock estimé qui en découle (plan
 * `limites-de-commande/plan-jour-meme-sur-stock.md`, J1, 2026-10-21).
 *
 * Le stock estimé est le reçu tant que le circuit « jour même sur stock »
 * n'existe pas (J2) : les commandes déjà passées pour ce jour l'ont été la
 * veille, le fournil les a fabriquées pour elles, et elles ne puisent pas dans
 * la vitrine. Lecture sous `handover_counter:read`, gestes sous `:write`.
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
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './reassort-boutique-page.html',
  styleUrl: './reassort-boutique-page.scss',
})
export class ReassortBoutiquePage {
  private readonly service = inject(ResupplyReceiptsService);
  private readonly pickups = inject(PickupAddressesService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('handover_counter:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly sites = signal<readonly PickupAddressView[]>([]);
  protected readonly articles = signal<readonly ResupplyArticleView[]>([]);
  protected readonly siteId = signal<string | null>(null);
  protected readonly day = signal(parisToday());
  protected readonly receipt = signal<ResupplyReceiptView | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  /** Ce que l'on s'apprête à ajouter : un article choisi, une quantité. */
  protected readonly pickedSku = signal<string | null>(null);
  protected readonly pickedQuantity = signal<number | null>(null);
  /** Les quantités en cours de correction, par SKU. */
  protected readonly drafts = signal<ReadonlyMap<string, number | null>>(new Map());

  protected readonly siteOptions = computed<FoldSelectOption<string>[]>(() =>
    this.sites().map((site) => ({ value: site.id, label: site.label })),
  );
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

  constructor() {
    void this.start();
  }

  /** Les points de retrait et le catalogue, puis la liste du premier point. */
  protected async start(): Promise<void> {
    this.state.set('loading');
    try {
      const [sites, articles] = await Promise.all([this.pickups.list(), this.service.articles()]);
      this.sites.set(sites);
      this.articles.set(articles);
      this.siteId.set(this.siteId() ?? sites[0]?.id ?? null);
      await this.reload();
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async chooseSite(siteId: string): Promise<void> {
    this.siteId.set(siteId);
    await this.refresh();
  }

  protected async chooseDay(day: string): Promise<void> {
    if (day === '') {
      return;
    }
    this.day.set(day);
    await this.refresh();
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

  private async refresh(): Promise<void> {
    this.failure.set(null);
    try {
      await this.reload();
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  private async reload(): Promise<void> {
    const siteId = this.siteId();
    this.drafts.set(new Map());
    this.receipt.set(siteId === null ? null : await this.service.read(siteId, this.day()));
  }
}

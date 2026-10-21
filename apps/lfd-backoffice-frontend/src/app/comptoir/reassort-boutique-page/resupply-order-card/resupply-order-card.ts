import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type {
  ResupplyArticleView,
  ResupplyTarget,
  SiteResupplyDraftView,
  SiteResupplyLineView,
  SiteResupplyView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldComboboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldNumberInputComponent,
  type FoldSelectOption,
  FoldStatusBadgeComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { refreshWhileVisible } from '../../../shared/periodic-refresh';
import {
  parisClock,
  RESUPPLY_TARGET_LABELS,
  resupplyDayLabel,
} from '../../../shared/resupply-labels';
import { SiteResuppliesStore } from '../site-resupplies.store';

/**
 * **Commander le réassort** du point ouvert dans le bandeau (lots R1 et R1c,
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-21) : choisir
 * « Pour demain » (la commande du soir, avant l'heure limite si le réassort
 * y est soumis) ou « Au plus tôt » (aujourd'hui, sans heure limite), ajouter
 * des articles à la DEMANDE EN COURS de cette visée, puis « Envoyer le
 * réassort » ; ensuite la liste des réassorts envoyés, annulables.
 *
 * Depuis R1c, la demande en cours est enregistrée : chaque ajout, correction
 * ou retrait l'écrit, et l'écran la relit — après chaque geste, toutes les
 * 15 s tant que l'onglet est visible, et dès qu'on y revient. Un autre poste
 * la remplit donc sous vos yeux, et un rechargement ne la perd plus.
 */
@Component({
  selector: 'app-resupply-order-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldComboboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldNumberInputComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './resupply-order-card.html',
  styleUrl: './resupply-order-card.scss',
})
export class ResupplyOrderCard {
  private readonly store = inject(SiteResuppliesStore);
  private readonly permissions = inject(PermissionsStore);

  /** Le point du bandeau. */
  readonly siteId = input.required<string>();
  /** Le catalogue publié, lu une fois par la page. */
  readonly articles = input.required<readonly ResupplyArticleView[]>();

  protected readonly canWrite = computed(() => this.permissions.can('handover_counter:write'));
  protected readonly targetLabels = RESUPPLY_TARGET_LABELS;
  protected readonly view = this.store.view;
  protected readonly drafts = this.store.drafts;
  protected readonly loadFailed = this.store.loadFailed;
  protected readonly pending = this.store.pending;
  protected readonly failure = this.store.failure;
  protected readonly target = signal<ResupplyTarget | null>(null);
  protected readonly pickedSku = signal<string | null>(null);
  protected readonly pickedQuantity = signal<number | null>(null);
  /**
   * Les quantités en cours de correction, par demande, VERSION et article :
   * une demande changée par un autre poste fait tomber la saisie faite sur
   * l'ancienne, plutôt que de l'envoyer sur ce qu'on n'a pas vu.
   */
  protected readonly edits = signal<ReadonlyMap<string, number | null>>(new Map());

  /** Tout le catalogue : un article déjà demandé s'ajoute en plus. */
  protected readonly articleOptions = computed<FoldSelectOption<string>[]>(() =>
    this.articles().map((article) => ({
      value: article.sku,
      label: `${article.name} · ${article.sku}`,
    })),
  );
  protected readonly canAdd = computed(
    () =>
      this.target() !== null &&
      this.pickedSku() !== null &&
      (this.pickedQuantity() ?? 0) >= 1 &&
      !this.pending(),
  );
  /** « Pour demain » : jusqu'à quelle heure, quand une limite s'applique. */
  protected readonly orderUntil = computed(() => {
    const until = this.view()?.tomorrowOrderUntil ?? null;
    return until === null ? null : parisClock(until);
  });
  /** Les réassorts envoyés du point, aujourd'hui d'abord, puis demain. */
  protected readonly days = computed(() => {
    const view = this.view();
    if (view === null) {
      return [];
    }
    return [view.today, view.tomorrow].map((day) => ({
      day,
      label: `${day === view.today ? "Aujourd'hui" : 'Demain'}, ${resupplyDayLabel(day)}`,
      resupplies: view.resupplies.filter((resupply) => resupply.serviceDay === day),
    }));
  });

  constructor() {
    effect(() => {
      const siteId = this.siteId();
      untracked(() => {
        this.target.set(null);
        this.pickedSku.set(null);
        this.pickedQuantity.set(null);
        this.edits.set(new Map());
        void this.store.load(siteId);
      });
    });
    refreshWhileVisible(() => this.refresh());
  }

  protected pick(target: ResupplyTarget): void {
    this.target.set(target);
  }

  protected async addLine(): Promise<void> {
    const target = this.target();
    const sku = this.pickedSku();
    const quantity = this.pickedQuantity();
    if (target === null || sku === null || quantity === null || !this.canAdd()) {
      return;
    }
    if (await this.store.addLine(target, sku, quantity)) {
      this.pickedSku.set(null);
      this.pickedQuantity.set(null);
    }
  }

  protected draftTitle(draft: SiteResupplyDraftView): string {
    return `${this.targetLabels[draft.target]} — ${resupplyDayLabel(draft.serviceDay)}`;
  }

  protected quantityOf(draft: SiteResupplyDraftView, line: SiteResupplyLineView): number | null {
    const edit = this.edits().get(editKey(draft, line.sku));
    return edit === undefined ? line.quantity : edit;
  }

  protected setQuantity(
    draft: SiteResupplyDraftView,
    line: SiteResupplyLineView,
    quantity: number | null,
  ): void {
    this.edits.update((edits) => new Map(edits).set(editKey(draft, line.sku), quantity));
  }

  protected changed(draft: SiteResupplyDraftView, line: SiteResupplyLineView): boolean {
    const quantity = this.quantityOf(draft, line);
    return quantity !== null && quantity >= 1 && quantity !== line.quantity;
  }

  protected async correct(draft: SiteResupplyDraftView, line: SiteResupplyLineView): Promise<void> {
    const quantity = this.quantityOf(draft, line);
    if (quantity !== null) {
      await this.store.correctLine(draft, line.sku, quantity);
    }
  }

  protected async withdraw(
    draft: SiteResupplyDraftView,
    line: SiteResupplyLineView,
  ): Promise<void> {
    await this.store.withdrawLine(draft, line.sku);
  }

  protected async send(draft: SiteResupplyDraftView): Promise<void> {
    await this.store.send(draft);
  }

  protected async cancel(resupply: SiteResupplyView): Promise<void> {
    await this.store.cancel(resupply);
  }

  protected placedLine(resupply: SiteResupplyView): string {
    const by = resupply.placedBy === null ? '' : ` par ${resupply.placedBy}`;
    return `Envoyé à ${parisClock(resupply.placedAt)}${by}`;
  }

  protected load(): Promise<void> {
    return this.store.load(this.siteId());
  }

  /** La relecture périodique se tait pendant un geste : il relit lui-même. */
  private async refresh(): Promise<void> {
    if (!this.pending()) {
      await this.load();
    }
  }
}

function editKey(draft: SiteResupplyDraftView, sku: string): string {
  return `${draft.id}:${String(draft.version)}:${sku}`;
}

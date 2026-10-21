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
  SiteResuppliesView,
  SiteResupplyView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
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
import {
  parisClock,
  RESUPPLY_TARGET_LABELS,
  resupplyDayLabel,
} from '../../../shared/resupply-labels';
import { SiteResuppliesService } from '../site-resupplies.service';

/** Une ligne du brouillon : il vit à l'écran jusqu'à « Passer le réassort ». */
interface DraftLine {
  readonly sku: string;
  readonly label: string;
  readonly quantity: number;
}

/**
 * **Commander le réassort** du point ouvert dans le bandeau (lot R1,
 * `reassort-boutiques/plan-reapprovisionnement.md` §12, 2026-10-21) : choisir
 * « Pour demain » (la commande du soir, avant l'heure limite si le réassort y
 * est soumis) ou « Au plus tôt » (aujourd'hui, sans heure limite), saisir les
 * lignes, passer ; puis la liste des réassorts du point, annulables.
 *
 * Le brouillon reste à l'écran : le serveur ne reçoit qu'un réassort entier,
 * et c'est lui qui en fixe la journée, sur son horloge.
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
  private readonly service = inject(SiteResuppliesService);
  private readonly permissions = inject(PermissionsStore);

  /** Le point du bandeau. */
  readonly siteId = input.required<string>();
  /** Le catalogue publié, lu une fois par la page. */
  readonly articles = input.required<readonly ResupplyArticleView[]>();

  protected readonly canWrite = computed(() => this.permissions.can('handover_counter:write'));
  protected readonly targetLabels = RESUPPLY_TARGET_LABELS;
  protected readonly view = signal<SiteResuppliesView | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly target = signal<ResupplyTarget | null>(null);
  protected readonly draft = signal<readonly DraftLine[]>([]);
  protected readonly pickedSku = signal<string | null>(null);
  protected readonly pickedQuantity = signal<number | null>(null);
  protected readonly pending = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly addableOptions = computed<FoldSelectOption<string>[]>(() => {
    const present = new Set(this.draft().map((line) => line.sku));
    return this.articles()
      .filter((article) => !present.has(article.sku))
      .map((article) => ({ value: article.sku, label: `${article.name} · ${article.sku}` }));
  });
  protected readonly canAdd = computed(
    () => this.pickedSku() !== null && (this.pickedQuantity() ?? 0) >= 1,
  );
  protected readonly canPlace = computed(
    () => this.target() !== null && this.draft().length > 0 && !this.pending(),
  );
  /** « Pour demain » : jusqu'à quelle heure, quand une limite s'applique. */
  protected readonly orderUntil = computed(() => {
    const until = this.view()?.tomorrowOrderUntil ?? null;
    return until === null ? null : parisClock(until);
  });
  /** Les réassorts du point, aujourd'hui d'abord, puis demain. */
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
      this.siteId();
      untracked(() => {
        this.reset();
        void this.load();
      });
    });
  }

  protected pick(target: ResupplyTarget): void {
    this.target.set(target);
    this.failure.set(null);
  }

  protected addLine(): void {
    const sku = this.pickedSku();
    const quantity = this.pickedQuantity();
    const article = this.articles().find((candidate) => candidate.sku === sku);
    if (article === undefined || quantity === null || quantity < 1) {
      return;
    }
    this.draft.update((lines) => [...lines, { sku: article.sku, label: article.name, quantity }]);
    this.pickedSku.set(null);
    this.pickedQuantity.set(null);
  }

  protected removeLine(sku: string): void {
    this.draft.update((lines) => lines.filter((line) => line.sku !== sku));
  }

  protected async place(): Promise<void> {
    const target = this.target();
    if (target === null || !this.canPlace()) {
      return;
    }
    const lines = this.draft().map(({ sku, quantity }) => ({ sku, quantity }));
    const done = await this.act((siteId) => this.service.place(siteId, { target, lines }));
    if (done) {
      this.reset();
    }
  }

  protected async cancel(resupply: SiteResupplyView): Promise<void> {
    await this.act((siteId) => this.service.cancel(siteId, resupply.id));
  }

  protected placedLine(resupply: SiteResupplyView): string {
    const by = resupply.placedBy === null ? '' : ` par ${resupply.placedBy}`;
    return `Passé à ${parisClock(resupply.placedAt)}${by}`;
  }

  protected async load(): Promise<void> {
    const siteId = this.siteId();
    try {
      const view = await this.service.list(siteId);
      // Une réponse d'un point quitté entre-temps est jetée.
      if (siteId === this.siteId()) {
        this.view.set(view);
        this.loadFailed.set(false);
      }
    } catch {
      this.loadFailed.set(true);
    }
  }

  /** Un geste, puis la relecture. Un refus laisse l'écran tel quel, avec sa raison. */
  private async act(gesture: (siteId: string) => Promise<unknown>): Promise<boolean> {
    if (this.pending()) {
      return false;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await gesture(this.siteId());
      await this.load();
      return true;
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réassort n'a pas pu être enregistré."));
      return false;
    } finally {
      this.pending.set(false);
    }
  }

  private reset(): void {
    this.target.set(null);
    this.draft.set([]);
    this.pickedSku.set(null);
    this.pickedQuantity.set(null);
  }
}

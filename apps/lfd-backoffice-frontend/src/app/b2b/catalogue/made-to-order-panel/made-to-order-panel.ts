import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  RESERVED_VISIBILITIES,
  type ArticleReservationView,
  type ReservedVisibility,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldViewToggleComponent,
  type FoldPanelContent,
  type FoldPanelDefaults,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { MadeToOrderService } from '../made-to-order.service';
import { RESERVED_VISIBILITY_LABELS, reservationDate } from '../made-to-order';

/** L'article dont on règle le sur mesure. */
export interface MadeToOrderPanelData {
  readonly sku: string;
  readonly name: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le sur mesure d'un article** (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, § 7, lot L1a) : le
 * marqueur, ce que voient les autres pros, et les comptes à qui l'article est
 * réservé.
 *
 * On réserve depuis la fiche du client (« Articles réservés ») : c'est là
 * qu'on sait à qui l'on parle. Ce panneau liste les comptes et y renvoie.
 *
 * Chaque geste part tout de suite et relit : le serveur reste l'autorité, et
 * un réglage n'a pas de brouillon à abandonner.
 */
@Component({
  selector: 'app-made-to-order-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldViewToggleComponent,
    RouterLink,
  ],
  templateUrl: './made-to-order-panel.html',
  styleUrl: './made-to-order-panel.scss',
})
export class MadeToOrderPanel implements FoldPanelContent<MadeToOrderPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { width: 'md' };

  readonly data = input<MadeToOrderPanelData | undefined>();

  private readonly api = inject(MadeToOrderService);
  private readonly notify = inject(NotifyService);
  private readonly panel = inject(FoldPanelRef);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canEdit = computed(() => this.permissions.can('lfc_catalog:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<ArticleReservationView | null>(null);
  protected readonly saving = signal(false);

  protected readonly visibilities: readonly FoldViewToggleOption[] = RESERVED_VISIBILITIES.map(
    (value) => ({ value, label: RESERVED_VISIBILITY_LABELS[value] }),
  );

  protected readonly when = reservationDate;

  constructor() {
    effect(() => {
      const data = this.data();
      if (data !== undefined) {
        void this.load(data.sku);
      }
    });
  }

  protected async load(sku: string): Promise<void> {
    try {
      this.view.set(await this.api.ofArticle(sku));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async setMadeToOrder(madeToOrder: boolean): Promise<void> {
    await this.save(
      (sku) => this.api.setMadeToOrder(sku, madeToOrder),
      madeToOrder ? 'Article marqué sur mesure.' : 'Marqueur sur mesure retiré.',
    );
  }

  protected visibilityLabel(visibility: ReservedVisibility): string {
    return RESERVED_VISIBILITY_LABELS[visibility];
  }

  /** La valeur rendue par `fold-view-toggle` est une `string` : on la ramène au domaine. */
  protected async setVisibility(value: string): Promise<void> {
    const visibility = RESERVED_VISIBILITIES.find((known) => known === value);
    if (
      this.saving() ||
      visibility === undefined ||
      visibility === this.view()?.reservedVisibility
    ) {
      return;
    }
    await this.save(
      (sku) => this.api.setReservedVisibility(sku, visibility),
      `Autres professionnels : ${RESERVED_VISIBILITY_LABELS[visibility].toLowerCase()}.`,
    );
  }

  protected close(): void {
    this.panel.close();
  }

  private async save(gesture: (sku: string) => Promise<void>, done: string): Promise<void> {
    const data = this.data();
    if (data === undefined) {
      return;
    }
    this.saving.set(true);
    try {
      await gesture(data.sku);
      this.notify.success(done);
      await this.load(data.sku);
    } catch (error) {
      this.notify.error(error, "Le réglage n'a pas pu être enregistré.");
    } finally {
      this.saving.set(false);
    }
  }
}

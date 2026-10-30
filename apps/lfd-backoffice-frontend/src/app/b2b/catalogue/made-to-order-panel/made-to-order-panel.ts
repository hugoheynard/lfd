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
  FoldCalloutComponent,
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
 * Règle « Saisir » (demande de Hugo, 2026-10-30) : la saisie reste locale
 * jusqu'à « Enregistrer », qui n'envoie que ce qui a changé ; le panneau se
 * ferme alors sur `true` et la ligne du catalogue relit. La liste des comptes
 * reste en lecture : elle se règle sur la fiche du client.
 *
 * ⚠️ `disableClose` : Échap passe par {@link cancel}, qui demande avant de
 * jeter une saisie. La croix de l'en-tête ferme sans demander —
 * `fold-panel-header` n'offre pas de veto (même limite que `image-panel`).
 */
@Component({
  selector: 'app-made-to-order-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    FoldViewToggleComponent,
    RouterLink,
  ],
  host: { '(keydown)': 'onKey($event)' },
  templateUrl: './made-to-order-panel.html',
  styleUrl: './made-to-order-panel.scss',
})
export class MadeToOrderPanel implements FoldPanelContent<MadeToOrderPanelData> {
  static readonly foldPanel: FoldPanelDefaults = { width: 'md', disableClose: true };

  readonly data = input<MadeToOrderPanelData | undefined>();

  private readonly api = inject(MadeToOrderService);
  private readonly notify = inject(NotifyService);
  private readonly panel = inject(FoldPanelRef);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canEdit = computed(() => this.permissions.can('lfc_made_to_order:write'));
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<ArticleReservationView | null>(null);
  protected readonly saving = signal(false);
  /** L'échec du dernier enregistrement ; la saisie reste en place. */
  protected readonly saveError = signal<string | null>(null);
  /** « Annuler » avec des changements : on demande avant de jeter. */
  protected readonly leaving = signal(false);

  /** La saisie locale — rien ne part avant « Enregistrer ». */
  protected readonly madeToOrder = signal(false);
  protected readonly visibility = signal<ReservedVisibility>('hidden');

  protected readonly markChanged = computed(
    () => this.view() !== null && this.madeToOrder() !== this.view()?.isMadeToOrder,
  );
  protected readonly visibilityChanged = computed(
    () => this.view() !== null && this.visibility() !== this.view()?.reservedVisibility,
  );
  protected readonly dirty = computed(() => this.markChanged() || this.visibilityChanged());

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
    this.state.set('loading');
    try {
      const view = await this.api.ofArticle(sku);
      this.view.set(view);
      this.madeToOrder.set(view.isMadeToOrder);
      this.visibility.set(view.reservedVisibility);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected visibilityLabel(visibility: ReservedVisibility): string {
    return RESERVED_VISIBILITY_LABELS[visibility];
  }

  /** La valeur rendue par `fold-view-toggle` est une `string` : on la ramène au domaine. */
  protected pickVisibility(value: string): void {
    const visibility = RESERVED_VISIBILITIES.find((known) => known === value);
    if (visibility !== undefined) {
      this.visibility.set(visibility);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }

  /**
   * N'envoie que ce qui a changé. La visibilité part AVANT le marqueur : un
   * article qui devient sur mesure l'est déjà avec ce que les autres pros
   * doivent en voir. Chaque geste réussi avance la référence locale : après
   * un échec partiel, réessayer ne renvoie que le reste.
   */
  protected async save(): Promise<void> {
    const data = this.data();
    const current = this.view();
    if (data === undefined || current === null || !this.dirty() || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      if (this.visibilityChanged()) {
        const visibility = this.visibility();
        await this.api.setReservedVisibility(data.sku, visibility);
        this.view.update((view) =>
          view === null ? view : { ...view, reservedVisibility: visibility },
        );
      }
      if (this.markChanged()) {
        const madeToOrder = this.madeToOrder();
        await this.api.setMadeToOrder(data.sku, madeToOrder);
        this.view.update((view) =>
          view === null ? view : { ...view, isMadeToOrder: madeToOrder },
        );
      }
      this.notify.success('Réglage sur mesure enregistré.');
      this.panel.close(true);
    } catch {
      this.saveError.set(
        "Le réglage n'a pas pu être enregistré. La saisie est conservée : réessayez.",
      );
    } finally {
      this.saving.set(false);
    }
  }

  /** Annuler — sans rien demander s'il n'y a rien à perdre. */
  protected cancel(): void {
    if (this.dirty()) {
      this.leaving.set(true);
      return;
    }
    this.panel.close();
  }

  protected discard(): void {
    this.panel.close();
  }

  protected keepEditing(): void {
    this.leaving.set(false);
  }
}

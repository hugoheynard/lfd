import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryBinView, DeliveryOrderBinsView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { BinLabel } from '../bin-label/bin-label';
import { binUrl } from '../delivery-loading';
import { DeliveryLoadingService } from '../delivery-loading.service';

type LabelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryOrderBinsView };

/**
 * **Les étiquettes des bacs d'une commande, à imprimer**
 * (`/livraison/etiquettes/:orderId`, L4-C16).
 *
 * 🔴 **Imprimer est une LECTURE.** Les bacs sont nés à leur déclaration ; cette
 * page ne fait que les relire et les mettre en page. Réimprimer — tout, ou une
 * seule étiquette abîmée — ne crée rien et n'écrit rien.
 *
 * Le gabarit d'une étiquette vit dans {@link BinLabel}, isolé : Q22 le
 * changera sans toucher à cette page.
 */
@Component({
  selector: 'app-bin-labels-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BinLabel,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './bin-labels-page.html',
  styleUrl: './bin-labels-page.scss',
})
export class BinLabelsPage {
  private readonly service = inject(DeliveryLoadingService);
  private readonly injector = inject(Injector);
  private readonly origin = inject(DOCUMENT).location.origin;

  /** La commande, lue dans l'adresse. */
  readonly orderId = input.required<string>();
  /**
   * `?bacs=id1,id2` : les bacs qu'une déclaration vient de créer (tranche C) —
   * on n'imprime qu'eux, les autres ont déjà leur étiquette. Absent : tous.
   */
  readonly bacs = input<string | undefined>();

  /** Tous les bacs vivants, même avec une sélection dans l'adresse. */
  protected readonly showAll = signal(false);

  protected readonly state = signal<LabelsState>({ status: 'loading' });
  private readonly reload = signal(0);

  /** L'étiquette qu'on réimprime seule, ou `null` : toutes. */
  private readonly only = signal<string | null>(null);

  /** Les bacs vivants : un bac annulé n'a plus d'étiquette. */
  protected readonly liveBins = computed<readonly DeliveryBinView[]>(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view.bins.filter((bin) => bin.voidedAt === null) : [];
  });

  private readonly selection = computed<readonly string[]>(() =>
    (this.bacs() ?? '').split(',').filter((binId) => binId !== ''),
  );

  /** Les bacs à l'écran : la sélection de l'adresse, ou tous. */
  protected readonly shown = computed<readonly DeliveryBinView[]>(() => {
    const selection = this.selection();
    return selection.length === 0 || this.showAll()
      ? this.liveBins()
      : this.liveBins().filter((bin) => selection.includes(bin.binId));
  });

  /** Une sélection restreint l'écran — de quoi proposer « toutes ». */
  protected readonly selective = computed(() => this.shown().length < this.liveBins().length);

  protected readonly printed = computed(() => {
    const only = this.only();
    return only === null ? this.shown() : this.shown().filter((bin) => bin.binId === only);
  });

  protected readonly reference = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view.reference : null;
  });

  /** La tournée et l'arrêt de la commande, imprimés en gros sur chaque étiquette (lot PC3). */
  protected readonly round = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view.round : null;
  });

  constructor() {
    effect(() => {
      const orderId = this.orderId();
      this.reload();
      untracked(() => void this.load(orderId));
    });
  }

  protected urlOf(bin: DeliveryBinView): string {
    return binUrl(this.origin, bin.binId);
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  /** Imprime toutes les étiquettes, ou la seule demandée. N'écrit rien. */
  protected print(binId: string | null = null): void {
    this.only.set(binId);
    afterNextRender(
      () => {
        window.print();
        this.only.set(null);
      },
      { injector: this.injector },
    );
  }

  private async load(orderId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      this.state.set({ status: 'ready', view: await this.service.orderBins(orderId) });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}

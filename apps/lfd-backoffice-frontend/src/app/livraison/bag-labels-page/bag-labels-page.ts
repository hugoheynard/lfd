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
import type { DeliveryBagView, DeliveryOrderBagsView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { BagLabel } from '../bag-label/bag-label';
import { bagUrl } from '../delivery-loading';
import { DeliveryLoadingService } from '../delivery-loading.service';

type LabelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryOrderBagsView };

/**
 * **Les étiquettes des sacs d'une commande, à imprimer**
 * (`/livraison/etiquettes/:orderId`, L4-C16).
 *
 * 🔴 **Imprimer est une LECTURE.** Les sacs sont nés à leur déclaration ; cette
 * page ne fait que les relire et les mettre en page. Réimprimer — tout, ou une
 * seule étiquette abîmée — ne crée rien et n'écrit rien.
 *
 * Le gabarit d'une étiquette vit dans {@link BagLabel}, isolé : Q22 le
 * changera sans toucher à cette page.
 */
@Component({
  selector: 'app-bag-labels-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BagLabel,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './bag-labels-page.html',
  styleUrl: './bag-labels-page.scss',
})
export class BagLabelsPage {
  private readonly service = inject(DeliveryLoadingService);
  private readonly injector = inject(Injector);
  private readonly origin = inject(DOCUMENT).location.origin;

  /** La commande, lue dans l'adresse. */
  readonly orderId = input.required<string>();

  protected readonly state = signal<LabelsState>({ status: 'loading' });
  private readonly reload = signal(0);

  /** L'étiquette qu'on réimprime seule, ou `null` : toutes. */
  private readonly only = signal<string | null>(null);

  /** Les sacs vivants : un sac annulé n'a plus d'étiquette. */
  protected readonly liveBags = computed<readonly DeliveryBagView[]>(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view.bags.filter((bag) => bag.voidedAt === null) : [];
  });

  protected readonly printed = computed(() => {
    const only = this.only();
    return only === null ? this.liveBags() : this.liveBags().filter((bag) => bag.bagId === only);
  });

  protected readonly reference = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view.reference : null;
  });

  constructor() {
    effect(() => {
      const orderId = this.orderId();
      this.reload();
      untracked(() => void this.load(orderId));
    });
  }

  protected urlOf(bag: DeliveryBagView): string {
    return bagUrl(this.origin, bag.bagId);
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  /** Imprime toutes les étiquettes, ou la seule demandée. N'écrit rien. */
  protected print(bagId: string | null = null): void {
    this.only.set(bagId);
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
      this.state.set({ status: 'ready', view: await this.service.orderBags(orderId) });
    } catch {
      this.state.set({ status: 'error' });
    }
  }
}

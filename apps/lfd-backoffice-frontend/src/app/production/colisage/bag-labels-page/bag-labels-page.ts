import { HttpErrorResponse } from '@angular/common/http';
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
import type { PackingBagLabelView, PackingBagLabelsView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PackingContainersService } from '../../packing-containers.service';
import { serverMessageOf } from '../../server-message';
import { BagLabel } from '../bag-label/bag-label';

const NOT_FOUND = 404;

type LabelsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string | null }
  | { readonly status: 'ready'; readonly view: PackingBagLabelsView };

/**
 * **Les étiquettes des sacs d'une commande, à imprimer**
 * (`/colisage/etiquettes/:date/:orderId`, 2026-10-25).
 *
 * La mécanique de {@link BinLabelsPage} : une page qu'on imprime, une
 * étiquette par page, toutes ou une seule réimprimée. 🔴 **Imprimer est une
 * LECTURE** : aucun sac ne naît ici.
 */
@Component({
  selector: 'app-bag-labels-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BagLabel,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './bag-labels-page.html',
  styleUrl: './bag-labels-page.scss',
})
export class BagLabelsPage {
  private readonly api = inject(PackingContainersService);
  private readonly injector = inject(Injector);

  /** La journée du poste, lue dans l'adresse. */
  readonly date = input.required<string>();
  readonly orderId = input.required<string>();
  /** `?sacs=id` : le sac dont on a cliqué « Étiquette ». Absent : tous. */
  readonly sacs = input<string | undefined>();

  /** Tous les sacs, même avec une sélection dans l'adresse. */
  protected readonly showAll = signal(false);
  protected readonly state = signal<LabelsState>({ status: 'loading' });
  private readonly reload = signal(0);
  /** L'étiquette qu'on réimprime seule, ou `null` : toutes. */
  private readonly only = signal<string | null>(null);

  protected readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  protected readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : null;
  });

  private readonly bags = computed<readonly PackingBagLabelView[]>(() => this.view()?.bags ?? []);

  private readonly selection = computed<readonly string[]>(() =>
    (this.sacs() ?? '').split(',').filter((id) => id !== ''),
  );

  /** Les sacs à l'écran : la sélection de l'adresse, ou tous. */
  protected readonly shown = computed<readonly PackingBagLabelView[]>(() => {
    const selection = this.selection();
    return selection.length === 0 || this.showAll()
      ? this.bags()
      : this.bags().filter((bag) => selection.includes(bag.containerId));
  });

  protected readonly selective = computed(() => this.shown().length < this.bags().length);

  protected readonly printed = computed(() => {
    const only = this.only();
    return only === null ? this.shown() : this.shown().filter((bag) => bag.containerId === only);
  });

  constructor() {
    effect(() => {
      const date = this.date();
      const orderId = this.orderId();
      this.reload();
      untracked(() => void this.load(date, orderId));
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  /** Imprime toutes les étiquettes, ou la seule demandée. N'écrit rien. */
  protected print(containerId: string | null = null): void {
    this.only.set(containerId);
    afterNextRender(
      () => {
        window.print();
        this.only.set(null);
      },
      { injector: this.injector },
    );
  }

  private async load(date: string, orderId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      this.state.set({ status: 'ready', view: await this.api.bagLabels(date, orderId) });
    } catch (error) {
      this.state.set({ status: 'error', message: refusalOf(error) });
    }
  }
}

/**
 * Un 404 dit pourquoi (la commande n'est pas au poste de ce jour) : on le
 * montre tel quel. Toute autre panne garde le message de la page — les replis
 * de `serverMessageOf` parlent d'un geste, et lire n'en est pas un.
 */
function refusalOf(error: unknown): string | null {
  return error instanceof HttpErrorResponse && error.status === NOT_FOUND
    ? serverMessageOf(error)
    : null;
}

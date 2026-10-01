import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { MyDeliveryRoundSummaryView, MyDeliveryRoundView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldViewToggleOption } from 'fold-ng';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { parisTimeOf } from '../delivery-loading';
import { roundLabel, stopCountLabel } from '../delivery-rounds';
import {
  goToHref,
  NAVIGATION_APPS,
  type NavigationApp,
  placeOf,
  readNavigationApp,
  remainingStops,
  routeLegs,
  writeNavigationApp,
} from '../my-round-navigation';
import { MyDeliveryRoundService } from '../my-delivery-round.service';
import { MyRoundStop } from '../my-round-stop/my-round-stop';
import { parisDayOf } from '../run-sheet';

type ListState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly rounds: readonly MyDeliveryRoundSummaryView[] };

type RoundState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly round: MyDeliveryRoundView };

/** Le stockage de l'appareil, ou rien : un navigateur qui le refuse ne casse pas la page. */
function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

/**
 * **Ma tournée** — la page du livreur (`documentation/livraisons/plan-ma-tournee.md`,
 * MT-D7 ; navigation `plan-y-aller-et-position.md`, YA2). Pensée téléphone
 * d'abord : une colonne, de grands boutons.
 *
 * Aujourd'hui seulement : une tournée s'ouvre d'elle-même, plusieurs se
 * choisissent. Au dépôt, « Commencer ma tournée » ; partie, les liens de
 * navigation. Un refus du serveur s'affiche tel quel — il est écrit pour le
 * livreur (MT-D3 v2) — et la tournée est relue.
 */
@Component({
  selector: 'app-my-round-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    MyRoundStop,
  ],
  templateUrl: './my-round-page.html',
  styleUrl: './my-round-page.scss',
})
export class MyRoundPage {
  private readonly service = inject(MyDeliveryRoundService);
  private readonly storage = deviceStorage();

  private readonly today = parisDayOf(new Date());

  protected readonly list = signal<ListState>({ status: 'loading' });
  protected readonly selected = signal<string | null>(null);
  protected readonly detail = signal<RoundState>({ status: 'loading' });

  /** Le dernier refus du serveur — la tournée reste à l'écran. */
  protected readonly refusal = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly app = signal<NavigationApp>(readNavigationApp(this.storage));
  protected readonly appOptions: readonly FoldViewToggleOption[] = NAVIGATION_APPS;

  protected readonly rounds = computed(() => {
    const list = this.list();
    return list.status === 'ready' ? list.rounds : [];
  });

  /** Plusieurs tournées aujourd'hui : on peut revenir au choix. */
  protected readonly canGoBack = computed(() => this.rounds().length > 1);

  protected readonly round = computed(() => {
    const detail = this.detail();
    return detail.status === 'ready' ? detail.round : null;
  });
  protected readonly departed = computed(() => (this.round()?.departedAt ?? null) !== null);
  protected readonly remaining = computed(() => remainingStops(this.round()?.stops ?? []));
  protected readonly legs = computed(() => routeLegs(this.remaining()));
  /** Ce qui reste et ne peut entrer dans aucun lien : ni point ni adresse. */
  protected readonly unplaced = computed(
    () => this.remaining().filter((stop) => placeOf(stop) === null).length,
  );
  /** « Rentrer » : partie, plus rien à faire, et un point de départ connu. */
  protected readonly homeHref = computed(() => {
    const home = this.round()?.home ?? null;
    return this.departed() && this.remaining().length === 0 && home !== null
      ? goToHref(this.app(), home)
      : null;
  });

  protected readonly roundLabel = roundLabel;
  protected readonly stopCountLabel = stopCountLabel;
  protected readonly timeOf = parisTimeOf;

  constructor() {
    void this.loadList();
  }

  protected goToOf(stop: MyDeliveryRoundView['stops'][number]): string | null {
    return this.departed() ? goToHref(this.app(), stop) : null;
  }

  protected pickApp(value: string): void {
    const app = NAVIGATION_APPS.find((option) => option.value === value)?.value;
    if (app !== undefined) {
      this.app.set(app);
      writeNavigationApp(this.storage, app);
    }
  }

  protected open(roundId: string): void {
    this.selected.set(roundId);
    this.refusal.set(null);
    void this.loadRound(roundId);
  }

  protected back(): void {
    this.selected.set(null);
    this.refusal.set(null);
  }

  protected retryList(): void {
    void this.loadList();
  }

  protected retryRound(): void {
    const id = this.selected();
    if (id !== null) {
      void this.loadRound(id);
    }
  }

  /** « Commencer ma tournée » — avec la version lue ; relue après, refusée ou non. */
  protected async depart(): Promise<void> {
    const round = this.round();
    if (round === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.service.depart(round.id, { version: round.version });
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La tournée n’a pas pu commencer.'));
    }
    // Relire dans les deux cas : partie, elle montre ses liens ; refusée, sa
    // version a peut-être changé au dépôt.
    await this.loadRound(round.id);
    this.busy.set(false);
  }

  private async loadList(): Promise<void> {
    this.list.set({ status: 'loading' });
    try {
      const { rounds } = await this.service.mine(this.today);
      this.list.set({ status: 'ready', rounds });
      const [only] = rounds;
      if (rounds.length === 1 && only !== undefined) {
        this.open(only.id);
      }
    } catch {
      this.list.set({ status: 'error' });
    }
  }

  private async loadRound(roundId: string): Promise<void> {
    // Une relecture de la même tournée la garde à l'écran.
    const current = this.detail();
    if (current.status !== 'ready' || current.round.id !== roundId) {
      this.detail.set({ status: 'loading' });
    }
    try {
      const round = await this.service.round(roundId);
      if (this.selected() === roundId) {
        this.detail.set({ status: 'ready', round });
      }
    } catch {
      if (this.selected() === roundId) {
        this.detail.set({ status: 'error' });
      }
    }
  }
}

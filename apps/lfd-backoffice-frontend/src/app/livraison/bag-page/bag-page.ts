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
import { RouterLink } from '@angular/router';
import type { DeliveryBagDetailView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDangerZoneComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { roundLabel, serviceDayLabel } from '../delivery-rounds';
import { bagIndexLabel, parisTimeOf } from '../delivery-loading';
import { DeliveryLoadingService } from '../delivery-loading.service';

type BagState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryBagDetailView };

/** Ce que la page permet, une fois le sac lu. Un seul cas à la fois. */
export type BagSituation =
  | 'voided'
  /** 🔴 dans aucune tournée : « à répartir d'abord ». */
  | 'unassigned'
  /** la tournée est partie : lecture seule (I6). */
  | 'departed'
  | 'loaded'
  | 'loadable';

/** Le cas d'un sac, dans l'ordre où il se lit : annulé avant tout, parti avant chargé. */
export function situationOf(view: DeliveryBagDetailView): BagSituation {
  if (view.bag.voidedAt !== null) {
    return 'voided';
  }
  if (view.round === null) {
    return 'unassigned';
  }
  if (view.round.departedAt !== null) {
    return 'departed';
  }
  return view.loadedAt === null ? 'loadable' : 'loaded';
}

/**
 * **Ce qu'on voit en ouvrant le QR d'un sac** (`/livraison/sac/:bagId`, L4-C13).
 *
 * 🔴 **Ouvrir n'écrit RIEN.** Un aperçu de lien, un historique ou un curieux qui
 * scanne avec l'appareil photo du téléphone arrivent ici : la page montre le
 * sac, sa commande et sa tournée, et c'est le bouton « Charger dans … » — un
 * geste, sous `delivery_loading:write` — qui écrit. La règle que le colisage
 * suit déjà.
 */
@Component({
  selector: 'app-bag-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDangerZoneComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './bag-page.html',
  styleUrl: './bag-page.scss',
})
export class BagPage {
  private readonly service = inject(DeliveryLoadingService);
  private readonly permissions = inject(PermissionsStore);

  readonly bagId = input.required<string>();

  protected readonly state = signal<BagState>({ status: 'loading' });
  private readonly reload = signal(0);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_loading:write'));
  protected readonly canCompose = computed(() => this.permissions.can('delivery_rounds:read'));

  /** Le dernier refus du serveur, tel qu'il l'a dit. */
  protected readonly refusal = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  protected readonly situation = computed(() => {
    const view = this.view();
    return view === null ? null : situationOf(view);
  });

  protected readonly indexLabel = bagIndexLabel;
  protected readonly roundLabel = roundLabel;
  protected readonly dayLabel = serviceDayLabel;
  protected readonly timeOf = parisTimeOf;

  constructor() {
    effect(() => {
      const bagId = this.bagId();
      this.reload();
      untracked(() => void this.open(bagId));
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  /** « Charger dans … » — LE geste qui écrit. */
  protected loadBag(): Promise<void> {
    const view = this.view();
    if (view?.round == null) {
      return Promise.resolve();
    }
    const { roundId } = view.round;
    return this.write(
      () => this.service.load(roundId, { bagId: view.bag.bagId }),
      'Le sac n’a pas pu être chargé.',
    );
  }

  protected voidBag(): Promise<void> {
    const view = this.view();
    if (view === null) {
      return Promise.resolve();
    }
    return this.write(() => this.service.voidBag(view.bag.bagId), 'Le sac n’a pas pu être annulé.');
  }

  private async write(gesture: () => Promise<void>, fallback: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
    } catch (error) {
      // Tel quel : un sac d'une autre tournée, le serveur nomme le véhicule.
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      await this.read(this.bagId());
      this.busy.set(false);
    }
  }

  private async open(bagId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    await this.read(bagId);
  }

  private async read(bagId: string): Promise<void> {
    try {
      this.state.set({ status: 'ready', view: await this.service.bag(bagId) });
    } catch {
      if (this.state().status !== 'ready') {
        this.state.set({ status: 'error' });
      }
    }
  }
}

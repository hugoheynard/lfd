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
import type { DeliveryBinDetailView } from '@lfd/contracts';
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
import { binIndexLabel, binKindLabel, parisTimeOf, sharedWithLabel } from '../delivery-loading';
import { DeliveryLoadingService } from '../delivery-loading.service';

type BinState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryBinDetailView };

/** Ce que la page permet, une fois le bac lu. Un seul cas à la fois. */
export type BinSituation =
  | 'voided'
  /** 🔴 dans aucune tournée : « à répartir d'abord ». */
  | 'unassigned'
  /** la tournée est partie : lecture seule (I6). */
  | 'departed'
  | 'loaded'
  | 'loadable';

/** Le cas d'un bac, dans l'ordre où il se lit : annulé avant tout, parti avant chargé. */
export function situationOf(view: DeliveryBinDetailView): BinSituation {
  if (view.bin.voidedAt !== null) {
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
 * **Ce qu'on voit en ouvrant le QR d'un bac** (`/livraison/bac/:binId`, L4-C13) — un bac entier ou une moitié.
 *
 * 🔴 **Ouvrir n'écrit RIEN.** Un aperçu de lien, un historique ou un curieux qui
 * scanne avec l'appareil photo du téléphone arrivent ici : la page montre le
 * bac, sa commande et sa tournée, et c'est le bouton « Charger dans … » — un
 * geste, sous `delivery_loading:write` — qui écrit. La règle que le colisage
 * suit déjà.
 */
@Component({
  selector: 'app-bin-page',
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
  templateUrl: './bin-page.html',
  styleUrl: './bin-page.scss',
})
export class BinPage {
  private readonly service = inject(DeliveryLoadingService);
  private readonly permissions = inject(PermissionsStore);

  readonly binId = input.required<string>();

  protected readonly state = signal<BinState>({ status: 'loading' });
  private readonly reload = signal(0);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_loading:write'));
  /**
   * Annuler un bac est une écriture que le serveur ouvre au colisage OU au
   * chargement — celui qui a déclaré un bac de trop doit pouvoir le retirer.
   */
  protected readonly canVoid = computed(
    () =>
      this.permissions.can('production_packing:write') ||
      this.permissions.can('delivery_loading:write'),
  );
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

  protected readonly indexLabel = binIndexLabel;
  /** « Bac M · ½ gauche · 2 sacs dedans » — le type reste lisible même archivé (v2-7). */
  protected readonly kind = computed(() => {
    const bin = this.view()?.bin;
    if (bin === undefined) {
      return '';
    }
    return binKindLabel({
      binTypeName: bin.binType.name,
      half: bin.half,
      innerBags: bin.innerBags,
    });
  });

  protected readonly sharedWith = sharedWithLabel;
  protected readonly roundLabel = roundLabel;
  protected readonly dayLabel = serviceDayLabel;
  protected readonly timeOf = parisTimeOf;

  constructor() {
    effect(() => {
      const binId = this.binId();
      this.reload();
      untracked(() => void this.open(binId));
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  /** « Charger dans … » — LE geste qui écrit. */
  protected loadBin(): Promise<void> {
    const view = this.view();
    if (view?.round == null) {
      return Promise.resolve();
    }
    const { roundId } = view.round;
    return this.write(
      () => this.service.load(roundId, { binId: view.bin.binId }),
      'Le bac n’a pas pu être chargé.',
    );
  }

  protected voidBin(): Promise<void> {
    const view = this.view();
    if (view === null) {
      return Promise.resolve();
    }
    return this.write(() => this.service.voidBin(view.bin.binId), 'Le bac n’a pas pu être annulé.');
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
      // Tel quel : un bac d'une autre tournée, le serveur nomme le véhicule.
      this.refusal.set(httpErrorMessage(error, fallback));
    } finally {
      await this.read(this.binId());
      this.busy.set(false);
    }
  }

  private async open(binId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    await this.read(binId);
  }

  private async read(binId: string): Promise<void> {
    try {
      this.state.set({ status: 'ready', view: await this.service.bin(binId) });
    } catch {
      if (this.state().status !== 'ready') {
        this.state.set({ status: 'error' });
      }
    }
  }
}

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
import type { DeliveryLoadingRoundView, LoadDeliveryBinPayload } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { BinScanner } from '../bin-scanner/bin-scanner';
import { LoadingPlan } from '../loading-plan/loading-plan';
import {
  binCountLabel,
  binKindLabel,
  hasBinToRedo,
  missingStops,
  parisTimeOf,
  scannedBin,
  stopStateLabel,
} from '../delivery-loading';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { roundLabel, serviceDayLabel } from '../delivery-rounds';

type RoundState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryLoadingRoundView };

/** Ce qui vient de se passer, dit en une phrase. */
export interface LoadingNotice {
  readonly variant: 'success' | 'warning' | 'alert';
  readonly text: string;
}

/** Ce qu'on dit d'un code lu qui n'est pas un bac — il n'atteint jamais le réseau. */
const NOT_A_BIN =
  'Ce code ne désigne pas un bac : ni l’adresse d’un bac, ni un code court de six caractères.';

/** Le bac qu'un chargement accepté désigne, relu dans la tournée : « CMD-12 · bac 2 ». */
export function loadedNotice(
  view: DeliveryLoadingRoundView,
  payload: LoadDeliveryBinPayload,
): string {
  for (const stop of view.stops) {
    const bin = stop.bins.find((candidate) =>
      'binId' in payload ? candidate.binId === payload.binId : candidate.code === payload.code,
    );
    if (bin !== undefined) {
      return `${stop.reference} · ${stop.customerLabel} — bac ${String(bin.index)} (${binKindLabel(bin)}) chargé (${binCountLabel(stop)}).`;
    }
  }
  return 'Bac chargé.';
}

/**
 * **Charger UN véhicule** (`/livraison/chargement/:roundId`, lot 4, L4-C2).
 *
 * L'écran compare un ensemble de bacs à un véhicule : chaque arrêt dit « 2 bacs
 * sur 3 », l'arrêt sans bac déclaré est en rouge (L4-C17), un bac partagé
 * « à refaire » l'est aussi (v2-4), et le bas de l'écran dit ce qui manque
 * encore.
 *
 * 🔴 **Ici, le scan EST le geste** — à la différence de la page d'un bac, qu'on
 * ouvre sans rien écrire : on a choisi ce véhicule, et chaque QR lu charge. Le
 * serveur tranche tout le reste, et ses refus s'affichent tels quels (un bac
 * d'une autre tournée : il nomme le véhicule).
 *
 * Après « Partir », la tournée est gelée : l'écran passe en lecture seule.
 */
@Component({
  selector: 'app-loading-round-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BinScanner,
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    LoadingPlan,
    RouterLink,
  ],
  templateUrl: './loading-round-page.html',
  styleUrl: './loading-round-page.scss',
})
export class LoadingRoundPage {
  private readonly service = inject(DeliveryLoadingService);
  private readonly permissions = inject(PermissionsStore);

  readonly roundId = input.required<string>();

  protected readonly state = signal<RoundState>({ status: 'loading' });
  private readonly reload = signal(0);

  /** Ce qui vient de se passer : un bac chargé, un code étranger, un refus. */
  protected readonly notice = signal<LoadingNotice | null>(null);
  protected readonly busy = signal(false);
  /** Le code court tapé, quand le QR est illisible. */
  protected readonly typed = signal('');

  protected readonly view = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.view : null;
  });

  protected readonly departed = computed(() => (this.view()?.departedAt ?? null) !== null);

  /** On écrit si on en a le droit ET si la tournée n'est pas partie (I6). */
  protected readonly canLoad = computed(
    () =>
      this.permissions.can('delivery_loading:write') && this.view() !== null && !this.departed(),
  );

  protected readonly missing = computed(() => {
    const view = this.view();
    return view === null ? [] : missingStops(view);
  });

  /** Les arrêts qui portent un bac partagé à refaire (v2-4) — dits en alerte. */
  protected readonly toRedoCount = computed(
    () => this.view()?.stops.filter((stop) => hasBinToRedo(stop)).length ?? 0,
  );

  protected readonly title = computed(() => {
    const view = this.view();
    return view === null ? 'Chargement' : `Chargement · ${roundLabel(view)}`;
  });

  protected readonly binCountLabel = binCountLabel;
  protected readonly binKindLabel = binKindLabel;
  protected readonly hasBinToRedo = hasBinToRedo;
  protected readonly stateLabel = stopStateLabel;
  protected readonly timeOf = parisTimeOf;
  protected readonly dayLabel = serviceDayLabel;

  constructor() {
    effect(() => {
      const roundId = this.roundId();
      this.reload();
      untracked(() => void this.open(roundId));
    });
  }

  protected retry(): void {
    this.reload.update((n) => n + 1);
  }

  /** Un QR lu par la caméra : c'est le geste. */
  protected onScanned(raw: string): Promise<void> {
    return this.loadFrom(raw);
  }

  /** Le code court tapé. */
  protected loadTyped(): Promise<void> {
    return this.loadFrom(this.typed());
  }

  private async loadFrom(raw: string): Promise<void> {
    const payload = scannedBin(raw);
    if (payload === null) {
      this.notice.set({ variant: 'warning', text: NOT_A_BIN });
      return;
    }
    const roundId = this.roundId();
    const accepted = await this.write(
      () => this.service.load(roundId, payload),
      'Le bac n’a pas pu être chargé.',
    );
    if (accepted) {
      this.typed.set('');
      const view = this.view();
      this.notice.set({
        variant: 'success',
        text: view === null ? 'Bac chargé.' : loadedNotice(view, payload),
      });
    }
  }

  protected unload(binId: string): Promise<boolean> {
    const roundId = this.roundId();
    return this.write(
      () => this.service.unload(roundId, binId),
      'Le bac n’a pas pu être déchargé.',
    );
  }

  /**
   * « Partir » — refusé par le serveur tant qu'un arrêt n'est pas chargé (Q14,
   * L4-C17) ou porte un bac partagé à refaire (v2-4). Le refus s'affiche tel
   * quel : c'est lui qui nomme le bac et le geste de sortie.
   */
  protected async depart(): Promise<void> {
    const view = this.view();
    if (view === null) {
      return;
    }
    if (
      await this.write(
        () => this.service.depart(view.roundId, view.version),
        'La tournée n’a pas pu partir.',
      )
    ) {
      this.notice.set({ variant: 'success', text: `${roundLabel(view)} est parti.` });
    }
  }

  /** Une écriture, puis une relecture — acceptée ou non. Vrai si le serveur a accepté. */
  private async write(gesture: () => Promise<void>, fallback: string): Promise<boolean> {
    if (this.busy()) {
      return false;
    }
    this.busy.set(true);
    this.notice.set(null);
    let accepted = false;
    try {
      await gesture();
      accepted = true;
    } catch (error) {
      this.notice.set({ variant: 'alert', text: httpErrorMessage(error, fallback) });
    } finally {
      await this.read(this.roundId());
      this.busy.set(false);
    }
    return accepted;
  }

  private async open(roundId: string): Promise<void> {
    this.state.set({ status: 'loading' });
    await this.read(roundId);
  }

  private async read(roundId: string): Promise<void> {
    try {
      this.state.set({ status: 'ready', view: await this.service.round(roundId) });
    } catch {
      if (this.state().status !== 'ready') {
        this.state.set({ status: 'error' });
      }
    }
  }
}

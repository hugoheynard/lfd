import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { DeliveryLoadingRoundView, LoadDeliveryBinPayload } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { BinScanner } from '../bin-scanner/bin-scanner';
import {
  binCountLabel,
  binKindLabel,
  hasBinToRedo,
  missingStops,
  parisTimeOf,
  scannedBin,
  stopStateLabel,
} from '../delivery-loading';
import { roundLabel } from '../delivery-rounds';
import type { BinLoadAttempt, BinLoader } from '../delivery-loading-rows';
import { LoadingGateway } from '../loading-gateway';
import { LoadingPlan } from '../loading-plan/loading-plan';

type RoundState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly view: DeliveryLoadingRoundView };

/** Ce qui vient de se passer, dit en une phrase. */
export interface LoadingNotice {
  readonly variant: 'success' | 'warning' | 'alert';
  readonly text: string;
}

/** « Partir » depuis l'écran de chargement, avec la version lue — ou rien : pas offert ici. */
export type LoadingDeparture = (roundId: string, version: number) => Promise<void>;

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
 * **Charger UN véhicule** — le corps de l'écran (lot 4, L4-C2), sans sa page.
 *
 * L'écran compare un ensemble de bacs à un véhicule : chaque arrêt dit « 2 bacs
 * sur 3 », l'arrêt sans bac déclaré est en rouge (L4-C17), un bac partagé
 * « à refaire » l'est aussi (v2-4), et le bas de l'écran dit ce qui manque
 * encore.
 *
 * 🔴 **Ici, le scan EST le geste** : chaque QR lu charge. Le serveur tranche
 * tout le reste, et ses refus s'affichent tels quels (un bac d'une autre
 * tournée : il nomme le véhicule).
 *
 * Deux hôtes (PL1) : la page du dépôt et « Ma tournée ». Les routes viennent
 * de {@link LoadingGateway}, que l'hôte fournit ; le droit d'écrire et
 * « Partir » sont des entrées, parce que chaque hôte les tient sous son propre
 * droit. Après le départ, la tournée est gelée : lecture seule.
 */
@Component({
  selector: 'app-loading-round',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BinScanner,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldLoadingStateComponent,
    LoadingPlan,
  ],
  templateUrl: './loading-round.html',
  styleUrl: './loading-round.scss',
})
export class LoadingRound {
  private readonly gateway = inject(LoadingGateway);

  readonly roundId = input.required<string>();
  /** L'hôte tient le droit d'écrire ; la tournée partie l'éteint de toute façon (I6). */
  readonly canWrite = input(false);
  /** « Partir », offert par l'hôte ; `null` : l'écran ne le propose pas. */
  readonly departure = input<LoadingDeparture | null>(null);

  /** Chaque lecture réussie : l'hôte en tire son titre. */
  readonly viewChange = output<DeliveryLoadingRoundView>();

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

  protected readonly canLoad = computed(
    () => this.canWrite() && this.view() !== null && !this.departed(),
  );
  protected readonly canDepart = computed(() => this.canLoad() && this.departure() !== null);

  protected readonly missing = computed(() => {
    const view = this.view();
    return view === null ? [] : missingStops(view);
  });

  /** Les arrêts qui portent un bac partagé à refaire (v2-4) — dits en alerte. */
  protected readonly toRedoCount = computed(
    () => this.view()?.stops.filter((stop) => hasBinToRedo(stop)).length ?? 0,
  );

  protected readonly binCountLabel = binCountLabel;
  protected readonly binKindLabel = binKindLabel;
  protected readonly hasBinToRedo = hasBinToRedo;
  protected readonly stateLabel = stopStateLabel;
  protected readonly timeOf = parisTimeOf;

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
  protected async onScanned(raw: string): Promise<void> {
    await this.loadFrom(raw);
  }

  /** Le code court tapé. */
  protected async loadTyped(): Promise<void> {
    await this.loadFrom(this.typed());
  }

  /** Le même geste, prêté au panneau d'une rangée du plancher. */
  protected readonly loader: BinLoader = (raw) => this.loadFrom(raw);

  private async loadFrom(raw: string): Promise<BinLoadAttempt> {
    const payload = scannedBin(raw);
    if (payload === null) {
      this.notice.set({ variant: 'warning', text: NOT_A_BIN });
      return { accepted: false, payload: null, message: NOT_A_BIN };
    }
    const roundId = this.roundId();
    const accepted = await this.write(
      () => this.gateway.load(roundId, payload),
      'Le bac n’a pas pu être chargé.',
    );
    if (!accepted) {
      return {
        accepted,
        payload,
        message: this.notice()?.text ?? 'Un autre geste est en cours : réessayez.',
      };
    }
    this.typed.set('');
    const view = this.view();
    const text = view === null ? 'Bac chargé.' : loadedNotice(view, payload);
    this.notice.set({ variant: 'success', text });
    return { accepted, payload, message: text };
  }

  protected unload(binId: string): Promise<boolean> {
    const roundId = this.roundId();
    return this.write(
      () => this.gateway.unload(roundId, binId),
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
    const departure = this.departure();
    if (view === null || departure === null) {
      return;
    }
    if (
      await this.write(() => departure(view.roundId, view.version), 'La tournée n’a pas pu partir.')
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
      const view = await this.gateway.round(roundId);
      this.state.set({ status: 'ready', view });
      this.viewChange.emit(view);
    } catch {
      if (this.state().status !== 'ready') {
        this.state.set({ status: 'error' });
      }
    }
  }
}

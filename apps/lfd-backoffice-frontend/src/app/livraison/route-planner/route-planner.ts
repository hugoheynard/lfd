import { HttpErrorResponse } from '@angular/common/http';
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
import { RouterLink } from '@angular/router';
import type {
  DeliveryProposalMode,
  DeliveryProposedRoundView,
  DeliveryRoundProposalView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  type FoldSelectOption,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import {
  applyPayloadOf,
  detourLabel,
  distanceLabel,
  durationLabel,
  keptReasonLabel,
  MODE_OPTIONS,
  modeLabel,
  proposalWindowLabel,
  unlocatedReasonLabel,
} from '../delivery-routing';
import { roundLabel } from '../delivery-rounds';
import { DeliveryRoutingService } from '../delivery-routing.service';
import { timeLabel } from '../run-sheet';

/** Un geste en vol : un seul à la fois. */
type Phase = 'idle' | 'locating' | 'proposing' | 'applying';

const CONFLICT = 409;
const CHANGED = 'La composition a changé entre-temps : reproposez.';

/** Là où se règlent le départ et le calcul. */
const SETTINGS_LINK = '/livraison/depart';

/**
 * **Le calculateur de tournée** — « Situer les arrêts », « Proposer »,
 * « Appliquer » (`plan-preparation-de-tournee.md`, lot 7).
 *
 * Proposer est une LECTURE : la proposition s'affiche en aperçu, rien n'est
 * écrit tant qu'on n'a pas appliqué (L7-C6). Appliquer renvoie ce qu'on a vu,
 * avec les versions lues ; un refus s'affiche tel quel, et la page relit.
 */
@Component({
  selector: 'app-route-planner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './route-planner.html',
  styleUrl: './route-planner.scss',
})
export class RoutePlanner {
  private readonly routing = inject(DeliveryRoutingService);
  private readonly notify = inject(NotifyService);

  readonly day = input.required<string>();
  /** Les véhicules actifs ce jour-là ; vide si la flotte n'est pas lisible. */
  readonly vehicles = input<readonly FoldSelectOption<string>[]>([]);
  readonly canWrite = input(false);
  /** Une écriture de la page est en vol. */
  readonly disabled = input(false);
  /** La société de chaque commande, quand la feuille de route la connaît. */
  readonly companies = input<ReadonlyMap<string, string>>(new Map());
  readonly canOpenClients = input(false);
  /** `delivery_settings:read` : le mode se préremplit par le défaut des réglages. */
  readonly canReadSettings = input(false);

  /** Une proposition appliquée, ou refusée : la page relit. */
  readonly changed = output();

  /** Les véhicules décochés : par défaut aucun, donc tous ceux du jour. */
  private readonly unchecked = signal<ReadonlySet<string>>(new Set());
  protected readonly recomposeAll = signal(false);
  /** `null` : le serveur prend le défaut des réglages (qu'on n'a pas pu lire). */
  protected readonly mode = signal<DeliveryProposalMode | null>(null);
  /** Le défaut lu dans les réglages, pour y revenir à chaque jour. */
  private readonly defaultMode = signal<DeliveryProposalMode | null>(null);
  protected readonly proposal = signal<DeliveryRoundProposalView | null>(null);
  protected readonly phase = signal<Phase>('idle');
  protected readonly refusal = signal<string | null>(null);

  protected readonly busy = computed(() => this.phase() !== 'idle' || this.disabled());

  private readonly chosen = computed(() =>
    this.vehicles()
      .map((vehicle) => vehicle.value)
      .filter((id) => !this.unchecked().has(id)),
  );

  /** Aucun véhicule coché sur une flotte connue : rien à proposer. */
  protected readonly nothingChosen = computed(
    () => this.vehicles().length > 0 && this.chosen().length === 0,
  );

  protected readonly modeOptions = MODE_OPTIONS;
  protected readonly modeLabel = modeLabel;
  protected readonly settingsLink = SETTINGS_LINK;
  protected readonly roundLabel = roundLabel;
  protected readonly timeLabel = timeLabel;
  protected readonly windowLabel = proposalWindowLabel;
  protected readonly unlocatedReasonLabel = unlocatedReasonLabel;
  protected readonly keptReasonLabel = keptReasonLabel;

  constructor() {
    // Un autre jour : la proposition et les choix de l'autre jour ne valent plus.
    effect(() => {
      this.day();
      untracked(() => {
        this.proposal.set(null);
        this.refusal.set(null);
        this.unchecked.set(new Set());
        this.recomposeAll.set(false);
        this.mode.set(this.defaultMode());
      });
    });
    effect(() => {
      if (this.canReadSettings()) {
        untracked(() => void this.loadDefaultMode());
      }
    });
  }

  protected isChecked(vehicleId: string): boolean {
    return !this.unchecked().has(vehicleId);
  }

  protected toggle(vehicleId: string, checked: boolean): void {
    const next = new Set(this.unchecked());
    if (checked) {
      next.delete(vehicleId);
    } else {
      next.add(vehicleId);
    }
    this.unchecked.set(next);
  }

  /** « Départ 7 h 00 · retour 9 h 10 · 42,0 km · 2 h 10 ». */
  protected roundSummary(round: DeliveryProposedRoundView): string {
    return [
      `Départ ${timeLabel(round.departureTime)}`,
      `retour ${timeLabel(round.returnTime)}`,
      distanceLabel(round.meters),
      durationLabel(round.minutes),
    ].join(' · ');
  }

  protected estimateLabel(proposal: DeliveryRoundProposalView): string {
    const { detourPercent, averageSpeedKmh } = proposal.settings;
    return `Estimation à vol d’oiseau (${detourLabel(detourPercent)}, ${String(averageSpeedKmh)} km/h) : les heures et les durées sont indicatives, pas des promesses.`;
  }

  protected companyLink(orderId: string): string | null {
    const company = this.companies().get(orderId);
    return company === undefined || !this.canOpenClients()
      ? null
      : `/comptes-clients/${encodeURIComponent(company)}/informations`;
  }

  protected orderLink(orderId: string): string {
    return `/commandes/${encodeURIComponent(orderId)}`;
  }

  protected async locate(): Promise<void> {
    if (!this.start('locating')) {
      return;
    }
    try {
      await this.routing.locate(this.day());
      this.notify.success('Arrêts situés. Proposez pour voir la répartition.');
      // Une proposition affichée ignorait ces points : on la jette plutôt
      // que de laisser croire qu'elle en tient compte.
      this.proposal.set(null);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Les arrêts n’ont pas pu être situés.'));
    } finally {
      this.phase.set('idle');
    }
  }

  protected async propose(): Promise<void> {
    if (this.nothingChosen() || !this.start('proposing')) {
      return;
    }
    const day = this.day();
    try {
      const proposal = await this.routing.propose({
        day,
        vehicleIds: this.vehicles().length === 0 ? null : this.chosen(),
        recomposeAll: this.recomposeAll(),
        mode: this.mode(),
      });
      if (day === this.day()) {
        this.proposal.set(proposal);
      }
    } catch (error) {
      this.proposal.set(null);
      this.refusal.set(httpErrorMessage(error, 'La proposition n’a pas pu être calculée.'));
    } finally {
      this.phase.set('idle');
    }
  }

  protected async apply(): Promise<void> {
    const proposal = this.proposal();
    if (proposal === null || proposal.rounds.length === 0 || !this.start('applying')) {
      return;
    }
    try {
      await this.routing.apply(applyPayloadOf(proposal));
      this.proposal.set(null);
      this.notify.success('Proposition appliquée : elle se corrige à la main comme avant.');
    } catch (error) {
      const changed = error instanceof HttpErrorResponse && error.status === CONFLICT;
      // Jamais rejouée : elle écraserait ce qu'un collègue vient de composer.
      if (changed) {
        this.proposal.set(null);
      }
      this.refusal.set(
        httpErrorMessage(error, changed ? CHANGED : 'La proposition n’a pas pu être appliquée.'),
      );
    } finally {
      this.phase.set('idle');
      this.changed.emit();
    }
  }

  protected discard(): void {
    this.proposal.set(null);
    this.refusal.set(null);
  }

  /** Sans les réglages, le serveur prend leur défaut lui-même : rien à inventer ici. */
  private async loadDefaultMode(): Promise<void> {
    try {
      const { defaultMode } = await this.routing.settings();
      this.defaultMode.set(defaultMode);
      if (this.mode() === null) {
        this.mode.set(defaultMode);
      }
    } catch {
      // Le choix reste vide : « Proposer » laisse le serveur appliquer son défaut.
    }
  }

  private start(phase: Exclude<Phase, 'idle'>): boolean {
    if (this.busy()) {
      return false;
    }
    this.phase.set(phase);
    this.refusal.set(null);
    return true;
  }
}

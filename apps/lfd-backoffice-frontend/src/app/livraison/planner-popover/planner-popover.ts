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
import { Router } from '@angular/router';
import type { DeliveryProposalMode, DeliveryRoundProposalView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import type { FoldViewToggleOption } from 'fold-ng';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldLinkComponent,
  FoldPopoverComponent,
  FoldPopoverTriggerDirective,
  FoldViewToggleComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { MODE_OPTIONS } from '../delivery-routing';
import { DeliveryRoutingService } from '../delivery-routing.service';

/** Un véhicule qu'on coche — ou qu'on ne peut pas cocher, toutes ses tournées étant parties. */
export interface PlannerVehicle {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  /** « 4 arrêts », « partie · exclue ». */
  readonly sub: string;
  readonly excluded: boolean;
}

/** Une proposition reçue, et si elle reprenait tout (« Tout recomposer »). */
export interface PlannerResult {
  readonly proposal: DeliveryRoundProposalView;
  readonly recomposed: boolean;
}

/** Un geste en vol : un seul à la fois. */
type Phase = 'idle' | 'locating' | 'proposing';

/** Là où se règlent le départ et le calcul. */
const SETTINGS_LINK = '/livraison/depart';

/** La phrase d'aide sous « Proposer en », mode par mode. */
const MODE_HINTS: Readonly<Record<DeliveryProposalMode, string>> = {
  insert: 'Garde ce qui est placé à la main, ajoute le reste.',
  new_rounds: 'Ouvre des tournées neuves pour les commandes à répartir.',
};

/**
 * **« Proposer les tournées »** (`handoff-tournees/SPEC.md`, § 6) — le
 * calculateur, fondu dans le tableau : les véhicules, le mode, « Tout
 * recomposer », « Situer les arrêts » et « Proposer ».
 *
 * Proposer est une LECTURE (L7-C6) : la proposition remonte, la page
 * l'affiche en aperçu dans le tableau. Le refus du calcul s'affiche tel quel
 * dans le panneau, qui reste ouvert.
 */
@Component({
  selector: 'app-planner-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldLinkComponent,
    FoldPopoverComponent,
    FoldPopoverTriggerDirective,
    FoldViewToggleComponent,
  ],
  templateUrl: './planner-popover.html',
  styleUrl: './planner-popover.scss',
})
export class PlannerPopover {
  private readonly routing = inject(DeliveryRoutingService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  readonly day = input.required<string>();
  /** Les véhicules du jour ; vide si la flotte n'est pas lisible — le serveur prend alors les siens. */
  readonly vehicles = input<readonly PlannerVehicle[]>([]);
  readonly canWrite = input(false);
  /** Lecture des réglages : le mode se préremplit par leur défaut. */
  readonly canReadSettings = input(false);
  /** Une écriture de la page est en vol. */
  readonly disabled = input(false);
  /** Un aperçu est à l'écran : le bouton s'efface devant « Appliquer ». */
  readonly previewing = input(false);

  readonly proposed = output<PlannerResult>();
  /** Les arrêts viennent d'être situés : un aperçu affiché les ignorait. */
  readonly located = output();

  protected readonly open = signal(false);
  private readonly unchecked = signal<ReadonlySet<string>>(new Set());
  protected readonly recomposeAll = signal(false);
  /** `null` : le serveur prend le défaut des réglages (qu'on n'a pas pu lire). */
  protected readonly mode = signal<DeliveryProposalMode | null>(null);
  private readonly defaultMode = signal<DeliveryProposalMode | null>(null);
  protected readonly phase = signal<Phase>('idle');
  protected readonly refusal = signal<string | null>(null);

  protected readonly busy = computed(() => this.phase() !== 'idle' || this.disabled());
  protected readonly modeOptions: readonly FoldViewToggleOption[] = MODE_OPTIONS;

  protected readonly modeHint = computed(() => {
    if (this.recomposeAll()) {
      return 'Ignoré : « Tout recomposer » reprend tout.';
    }
    const mode = this.mode();
    return mode === null ? 'Le mode des réglages du calcul.' : MODE_HINTS[mode];
  });

  private readonly chosen = computed(() =>
    this.vehicles()
      .filter((vehicle) => !vehicle.excluded && !this.unchecked().has(vehicle.id))
      .map((vehicle) => vehicle.id),
  );

  /** Aucun véhicule coché sur une flotte connue : rien à proposer. */
  protected readonly nothingChosen = computed(
    () => this.vehicles().length > 0 && this.chosen().length === 0,
  );

  constructor() {
    // Un autre jour : les choix de l'autre jour ne valent plus.
    effect(() => {
      this.day();
      untracked(() => {
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

  protected isChecked(vehicle: PlannerVehicle): boolean {
    return !vehicle.excluded && !this.unchecked().has(vehicle.id);
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

  protected openSettings(): void {
    void this.router.navigateByUrl(SETTINGS_LINK);
  }

  protected pickMode(value: string): void {
    const option = MODE_OPTIONS.find((candidate) => candidate.value === value);
    if (option !== undefined) {
      this.mode.set(option.value);
    }
  }

  protected async locate(): Promise<void> {
    if (!this.start('locating')) {
      return;
    }
    try {
      await this.routing.locate(this.day());
      this.notify.success('Arrêts situés. Proposez pour voir la répartition.');
      this.located.emit();
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
      const recomposed = this.recomposeAll();
      const proposal = await this.routing.propose({
        day,
        vehicleIds: this.vehicles().length === 0 ? null : this.chosen(),
        recomposeAll: recomposed,
        mode: this.mode(),
      });
      if (day === this.day()) {
        this.open.set(false);
        this.proposed.emit({ proposal, recomposed });
      }
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'La proposition n’a pas pu être calculée.'));
    } finally {
      this.phase.set('idle');
    }
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

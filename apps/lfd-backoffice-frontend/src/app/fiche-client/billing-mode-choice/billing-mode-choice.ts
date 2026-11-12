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
import {
  BILLING_RHYTHM_KIND_LABELS,
  type BillingRhythmKind,
  type LegalEntityView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { PAYER_MODE_CHOICES } from '../../comptabilite/billing-rhythm-wording';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import type { InitialBillingMode } from '../facturation/initial-billing-mode';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le choix du mode de facturation** à l'ouverture d'un compte par l'équipe
 * et à l'activation d'un compte déclaré (plan
 * `documentation/comptabilite/facturation/plan-changement-de-mode-immediat.md`,
 * I3). Aucune valeur cochée d'avance : le mensuel « par défaut » n'est plus un
 * choix qu'on fait sans le voir.
 *
 * Ce composant ne pose rien : il dit le choix (`choiceChange`), et l'écran le
 * pose par la route du mode du payeur après le succès de son geste.
 *
 * Il n'exige rien quand il n'y a rien à choisir ici — aucune entité en
 * service, pas le droit d'écrire le mode (le serveur refuserait), ou un mode
 * déjà choisi pour ce compte (`companyId` donné).
 */
@Component({
  selector: 'app-billing-mode-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './billing-mode-choice.html',
  styleUrl: './billing-mode-choice.scss',
})
export class BillingModeChoice {
  /** Le compte existant (activation) — absent à l'ouverture. */
  readonly companyId = input<string | null>(null);

  readonly choiceChange = output<InitialBillingMode>();

  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly modesApi = inject(PayerBillingModeService);
  private readonly permissions = inject(PermissionsStore);

  /** Poser le mode demande `b2b_accounting:write` ; sans lui, le choix ne serait que refusé. */
  protected readonly canWrite = computed(
    () =>
      this.permissions.can('b2b_accounting:read') && this.permissions.can('b2b_accounting:write'),
  );

  protected readonly choices = PAYER_MODE_CHOICES;
  protected readonly state = signal<LoadState>('loading');
  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly entityId = signal<string | null>(null);
  protected readonly mode = signal<BillingRhythmKind | null>(null);
  /** Le mode déjà choisi pour ce compte chez l'entité retenue, ou `null`. */
  protected readonly alreadyChosen = signal<string | null>(null);

  protected readonly entityOptions = computed(() =>
    this.entities().map((entity) => ({ value: entity.id, label: entity.name })),
  );

  protected readonly choice = computed((): InitialBillingMode => {
    if (!this.canWrite()) {
      return { kind: 'not-required' };
    }
    if (this.state() !== 'ready') {
      return { kind: 'missing' };
    }
    const legalEntityId = this.entityId();
    if (legalEntityId === null || this.alreadyChosen() !== null) {
      return { kind: 'not-required' };
    }
    const mode = this.mode();
    return mode === null ? { kind: 'missing' } : { kind: 'chosen', legalEntityId, mode };
  });

  constructor() {
    effect(() => {
      const choice = this.choice();
      untracked(() => this.choiceChange.emit(choice));
    });
    effect(() => {
      const companyId = this.companyId();
      untracked(() => {
        if (this.canWrite()) {
          void this.load(companyId);
        }
      });
    });
  }

  protected async load(companyId: string | null = this.companyId()): Promise<void> {
    this.state.set('loading');
    try {
      const living = (await this.entitiesApi.list()).filter((entity) => entity.archivedAt === null);
      this.entities.set(living);
      const chosen =
        living.find((entity) => entity.id === this.entityId())?.id ?? living[0]?.id ?? null;
      this.entityId.set(chosen);
      await this.readStanding(chosen, companyId);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async chooseEntity(entityId: string): Promise<void> {
    this.entityId.set(entityId);
    this.state.set('loading');
    try {
      await this.readStanding(entityId, this.companyId());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected chooseMode(mode: BillingRhythmKind): void {
    this.mode.set(mode);
  }

  /** Un compte qui a déjà choisi son mode chez cette entité n'a pas à le redire. */
  private async readStanding(entityId: string | null, companyId: string | null): Promise<void> {
    if (entityId === null || companyId === null) {
      this.alreadyChosen.set(null);
      return;
    }
    const view = await this.modesApi.get(entityId, companyId);
    this.alreadyChosen.set(view.since === null ? null : BILLING_RHYTHM_KIND_LABELS[view.mode]);
  }
}

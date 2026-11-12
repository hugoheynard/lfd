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
  type InitialPayerBillingModeView,
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
import { AdminCompaniesService } from '../../comptes-clients/admin-companies.service';
import type { InitialBillingMode } from '../facturation/initial-billing-mode';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Le choix du mode de facturation** à l'ouverture d'un compte par l'équipe
 * et à l'activation d'un compte déclaré. Aucune valeur cochée d'avance : le
 * mensuel n'est pas un choix qu'on fait sans le voir.
 *
 * Ce composant ne pose rien : il dit le choix (`choiceChange`), et l'écran le
 * pose par la route du premier choix après le succès de son geste.
 *
 * Il n'exige rien quand il n'y a rien à choisir ici — aucune entité en
 * service, pas le droit nécessaire, un mode déjà choisi chez l'entité, ou un
 * site facturé chez son principal (`companyId` donné).
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

  private readonly companiesApi = inject(AdminCompaniesService);
  private readonly permissions = inject(PermissionsStore);

  /**
   * Le premier choix se pose et se lit sous `b2b_companies` seul, à
   * l'ouverture comme à l'activation (décidé par Hugo le 2026-11-12) : aucune
   * lecture comptable n'est demandée.
   */
  protected readonly canWrite = computed(() => this.permissions.can('b2b_companies:write'));

  protected readonly choices = PAYER_MODE_CHOICES;
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<InitialPayerBillingModeView>({
    entities: [],
    chosen: [],
    requiresChoice: true,
  });
  protected readonly entityId = signal<string | null>(null);
  protected readonly mode = signal<BillingRhythmKind | null>(null);

  protected readonly entityOptions = computed(() =>
    this.view().entities.map((entity) => ({ value: entity.id, label: entity.name })),
  );

  /** Le mode déjà choisi pour ce compte chez l'entité retenue, ou `null`. */
  protected readonly alreadyChosen = computed((): string | null => {
    const chosen = this.view().chosen.find((entry) => entry.legalEntityId === this.entityId());
    return chosen === undefined ? null : BILLING_RHYTHM_KIND_LABELS[chosen.mode];
  });

  protected readonly choice = computed((): InitialBillingMode => {
    if (!this.canWrite()) {
      return { kind: 'not-required' };
    }
    if (this.state() !== 'ready') {
      return { kind: 'missing' };
    }
    const legalEntityId = this.entityId();
    if (legalEntityId === null || !this.view().requiresChoice || this.alreadyChosen() !== null) {
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
      const view = await this.read(companyId);
      this.view.set(view);
      this.entityId.set(
        view.entities.find((entity) => entity.id === this.entityId())?.id ??
          view.entities[0]?.id ??
          null,
      );
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected chooseEntity(entityId: string): void {
    this.entityId.set(entityId);
  }

  protected chooseMode(mode: BillingRhythmKind): void {
    this.mode.set(mode);
  }

  /** Un compte existant se lit sous les sociétés ; à l'ouverture, rien n'est encore choisi. */
  private async read(companyId: string | null): Promise<InitialPayerBillingModeView> {
    if (companyId !== null) {
      return this.companiesApi.initialBillingMode(companyId);
    }
    return {
      entities: await this.companiesApi.billingModeEntities(),
      chosen: [],
      requiresChoice: true,
    };
  }
}

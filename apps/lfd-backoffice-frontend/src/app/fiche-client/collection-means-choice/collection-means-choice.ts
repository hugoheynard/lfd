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
  COLLECTION_MEANS_REASON_MAX,
  type CollectionMeansName,
  type LegalEntityView,
  type PayerBillingModeView,
  type PayerCollectionMeansView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldTextareaComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { effectiveClosureSentence } from '../../comptabilite/billing-rhythm-wording';
import { longDay } from '../../comptabilite/collection-month-wording';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import { NotifyService } from '../../notify.service';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';
import { PayerCollectionMeansService } from '../facturation/payer-collection-means.service';

type LoadState = 'loading' | 'ready' | 'error' | 'no-entity';

/** Les deux moyens d'un paiement au compte, dans les mots de l'écran. */
export const COLLECTION_MEANS_LABELS: Readonly<Record<CollectionMeansName, string>> = {
  sepa_debit: 'Prélèvement SEPA',
  bank_transfer: 'Virement bancaire',
};

const MEANS_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'sepa_debit', icon: 'repeat', label: COLLECTION_MEANS_LABELS.sepa_debit },
  { value: 'bank_transfer', icon: 'banknote', label: COLLECTION_MEANS_LABELS.bank_transfer },
];

function isMeans(value: string): value is CollectionMeansName {
  return value === 'sepa_debit' || value === 'bank_transfer';
}

/** Ce que la section montre sous le choix : le moyen affiché, et l'entité qui encaisse. */
export interface ShownCollectionMeans {
  readonly means: CollectionMeansName;
  readonly entity: LegalEntityView;
}

/**
 * **Comment un client au compte règle** — prélèvement SEPA ou virement
 * bancaire (plan `plan-paiement-au-compte-par-virement.md`, V1, V2, V10, § «
 * L'écran »).
 *
 * Le `fold-view-toggle` dit ce que la section montre dessous ; il ne change
 * rien tant qu'on n'a pas enregistré. Changer de moyen demande un motif, et la
 * confirmation nomme la date d'effet que le serveur posera : immédiate pour un
 * client qui n'a jamais commandé, sinon la prochaine clôture de son mode — une
 * période n'a qu'un moyen. Un seul changement programmé à la fois, mode et
 * moyen confondus (K1) : l'écran le dit avant le geste, le serveur le refuse
 * de toute façon.
 *
 * Un site facturé chez son principal lit le moyen du principal et ne le change
 * pas ici.
 */
@Component({
  selector: 'app-collection-means-choice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldTextareaComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './collection-means-choice.html',
  styleUrl: './collection-means-choice.scss',
})
export class CollectionMeansChoice {
  readonly companyId = input.required<string>();

  /** Le moyen que la section doit montrer dessous ; `null` : rien de lisible, la section garde le prélèvement. */
  readonly shownChange = output<ShownCollectionMeans | null>();

  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly api = inject(PayerCollectionMeansService);
  private readonly modes = inject(PayerBillingModeService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canRead = computed(() => this.permissions.can('b2b_accounting:read'));
  protected readonly canWrite = computed(() => this.permissions.can('b2b_collection_means:write'));

  protected readonly options = MEANS_OPTIONS;
  protected readonly reasonMax = COLLECTION_MEANS_REASON_MAX;

  protected readonly state = signal<LoadState>('loading');
  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly entityId = signal<string | null>(null);
  protected readonly view = signal<PayerCollectionMeansView | null>(null);
  protected readonly mode = signal<PayerBillingModeView | null>(null);
  protected readonly shown = signal<CollectionMeansName>('sepa_debit');
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly entityOptions = computed(() =>
    this.entities().map((entity) => ({ value: entity.id, label: entity.name })),
  );

  /** Le moyen qui fera foi si l'on ne fait rien : le programmé, sinon le courant. */
  private readonly standing = computed(
    (): CollectionMeansName | null => this.view()?.scheduled?.means ?? this.view()?.means ?? null,
  );

  protected readonly current = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    const label = COLLECTION_MEANS_LABELS[view.means];
    return view.since === null
      ? `${label}, par défaut`
      : `${label}, depuis le ${longDay(view.since)}`;
  });

  protected readonly scheduled = computed(() => {
    const next = this.view()?.scheduled ?? null;
    return next === null
      ? null
      : {
          label: COLLECTION_MEANS_LABELS[next.means],
          effectiveOn: longDay(next.effectiveAt),
          reason: next.reason,
        };
  });

  /** Un changement de MODE programmé ferme le moyen jusqu'à sa prise d'effet (K1). */
  protected readonly modePendingUntil = computed(() => {
    const next = this.mode()?.scheduled ?? null;
    return next === null ? null : longDay(next.effectiveAt);
  });

  protected readonly follows = computed(() => this.view()?.followsPayer ?? null);

  /** Le toggle montre un autre moyen que celui qui fera foi : c'est un changement à enregistrer. */
  protected readonly changing = computed(() => {
    const standing = this.standing();
    return standing !== null && this.shown() !== standing;
  });

  protected readonly locked = computed(
    () => this.follows() !== null || this.scheduled() !== null || this.modePendingUntil() !== null,
  );

  protected readonly reasonMissing = computed(() => this.reason().trim() === '');

  protected readonly canSave = computed(
    () =>
      this.canWrite() &&
      !this.busy() &&
      !this.locked() &&
      this.changing() &&
      !this.reasonMissing() &&
      this.reason().length <= COLLECTION_MEANS_REASON_MAX,
  );

  /** La date d'effet, dite avant le geste : le serveur la pose, l'écran l'annonce. */
  protected readonly effectiveSentence = computed(
    () =>
      'Si ce client n’a encore jamais commandé, le nouveau moyen prendra effet immédiatement. ' +
      `Sinon, il prendra effet ${effectiveClosureSentence(this.mode()?.upcomingClosures ?? [])}, ` +
      'à la prochaine clôture de son mode : les factures déjà émises gardent leur moyen.',
  );

  constructor() {
    effect(() => {
      const id = this.companyId();
      untracked(() => {
        if (this.canRead()) {
          void this.load(id);
        } else {
          this.shownChange.emit(null);
        }
      });
    });
  }

  protected async load(companyId: string = this.companyId()): Promise<void> {
    this.state.set('loading');
    try {
      const living = (await this.entitiesApi.list()).filter((entity) => entity.archivedAt === null);
      this.entities.set(living);
      const chosen =
        living.find((entity) => entity.id === this.entityId())?.id ?? living[0]?.id ?? null;
      this.entityId.set(chosen);
      if (chosen === null) {
        this.view.set(null);
        this.state.set('no-entity');
        this.shownChange.emit(null);
        return;
      }
      const view = await this.api.get(chosen, companyId);
      this.view.set(view);
      // Un site facturé chez un autre n'a pas de mode à lui : rien à annoncer.
      this.mode.set(view.followsPayer === null ? await this.modes.get(chosen, companyId) : null);
      this.reason.set('');
      this.state.set('ready');
      this.show(view.scheduled?.means ?? view.means);
    } catch {
      this.state.set('error');
      this.shownChange.emit(null);
    }
  }

  protected async chooseEntity(entityId: string): Promise<void> {
    this.entityId.set(entityId);
    this.refusal.set(null);
    await this.load();
  }

  protected choose(value: string): void {
    if (isMeans(value)) {
      this.show(value);
    }
  }

  /** Revenir au moyen qui fait foi, sans rien enregistrer. */
  protected keep(): void {
    const standing = this.standing();
    if (standing !== null) {
      this.show(standing);
    }
    this.reason.set('');
    this.refusal.set(null);
  }

  protected async save(): Promise<void> {
    const entityId = this.entityId();
    if (entityId === null || !this.canSave()) {
      return;
    }
    const means = this.shown();
    await this.act(
      () => this.api.set(entityId, this.companyId(), { means, reason: this.reason().trim() }),
      () => this.outcomeOf(means),
    );
  }

  protected async cancelScheduled(): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.act(
        () => this.api.cancelScheduled(entityId, this.companyId()),
        () => 'Changement de moyen annulé.',
      );
    }
  }

  /** Ce que la vue relue dit du geste : posé tout de suite, ou programmé à une clôture. */
  private outcomeOf(means: CollectionMeansName): string {
    const label = COLLECTION_MEANS_LABELS[means];
    const view = this.view();
    if (view?.scheduled?.means === means) {
      return `${label} à partir de la clôture du ${longDay(view.scheduled.effectiveAt)}.`;
    }
    if (view !== null && view.scheduled === null && view.means === means) {
      return `${label}, dès maintenant.`;
    }
    return `Moyen « ${label} » enregistré.`;
  }

  private show(means: CollectionMeansName): void {
    this.shown.set(means);
    const entity = this.entities().find((candidate) => candidate.id === this.entityId());
    this.shownChange.emit(entity === undefined ? null : { means, entity });
  }

  /** Un geste : son refus reste à l'écran avec les mots du serveur ; un succès relit, puis le dit. */
  private async act(gesture: () => Promise<void>, said: () => string): Promise<void> {
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
      await this.load();
      this.notify.success(said());
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le changement de moyen a été refusé.'));
    } finally {
      this.busy.set(false);
    }
  }
}

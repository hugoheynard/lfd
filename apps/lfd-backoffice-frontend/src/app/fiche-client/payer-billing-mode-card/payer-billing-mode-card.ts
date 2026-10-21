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
import {
  BILLING_RHYTHM_KIND_LABELS,
  type BillingRhythmKind,
  type LegalEntityView,
  type PayerBillingModeView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';

import type { AdminCompanyDetail } from '../../comptes-clients/admin-company';
import {
  CLOSURE_TIME_SENTENCE,
  closureLine,
  effectiveClosureSentence,
  ONE_CHANGE_AT_A_TIME,
  PAYER_MODE_CHOICES,
} from '../../comptabilite/billing-rhythm-wording';
import { longDay } from '../../comptabilite/collection-month-wording';
import { LegalEntitiesService } from '../../comptabilite/legal-entities.service';
import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { PayerBillingModeService } from '../facturation/payer-billing-mode.service';

type LoadState = 'loading' | 'ready' | 'error' | 'no-entity';

/** Les clôtures montrées : assez pour voir la bascule, pas un calendrier. */
const SHOWN_CLOSURES = 3;

/**
 * **Le mode de facturation d'un client** — mensuel par défaut, deux fois par
 * mois ou chaque semaine — chez l'entité émettrice en service (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`,
 * §16.9, M4b). Les DATES de chaque mode se règlent sur la fiche de l'entité.
 *
 * ## Un site facturé chez un autre n'a pas de mode
 *
 * Il suit celui de son payeur : la carte le dit, sans formulaire. Le suivi
 * `billing` en cours est ce qui en fait un site facturé ailleurs — la même
 * lecture que le serveur (`billedPayerOf`), qui refuse de toute façon.
 *
 * ## L'avertissement précède le geste
 *
 * Un seul changement à la fois (§12) : la règle est écrite en permanence, le
 * choix se ferme jusqu'à `changeLockedUntil`, et la confirmation nomme la
 * clôture de prise d'effet. Un refus du serveur s'affiche tel quel.
 */
@Component({
  selector: 'app-payer-billing-mode-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './payer-billing-mode-card.html',
  styleUrl: './payer-billing-mode-card.scss',
})
export class PayerBillingModeCard {
  readonly company = input.required<AdminCompanyDetail>();

  private readonly entitiesApi = inject(LegalEntitiesService);
  private readonly api = inject(PayerBillingModeService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  /** Lire le mode demande `b2b_accounting:read` ; le changer, `:write` — le serveur refuse de toute façon. */
  protected readonly canRead = computed(() => this.permissions.can('b2b_accounting:read'));
  protected readonly canWrite = computed(() => this.permissions.can('b2b_accounting:write'));

  protected readonly choices = PAYER_MODE_CHOICES;
  protected readonly rule = ONE_CHANGE_AT_A_TIME;
  protected readonly closureTime = CLOSURE_TIME_SENTENCE;

  protected readonly state = signal<LoadState>('loading');
  protected readonly entities = signal<readonly LegalEntityView[]>([]);
  protected readonly entityId = signal<string | null>(null);
  protected readonly view = signal<PayerBillingModeView | null>(null);
  protected readonly draft = signal<BillingRhythmKind>('monthly');
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /** Le payeur d'un site facturé chez un autre, ou `null` : ce compte se facture lui-même. */
  protected readonly followedPayer = computed(() => {
    const { parent, follows } = this.company().hierarchy;
    return parent !== null && follows.some((follow) => follow.aspect === 'billing')
      ? parent.enseigne
      : null;
  });

  protected readonly entityOptions = computed(() =>
    this.entities().map((entity) => ({ value: entity.id, label: entity.name })),
  );

  protected readonly current = computed(() => {
    const view = this.view();
    if (view === null) {
      return '';
    }
    const label = BILLING_RHYTHM_KIND_LABELS[view.mode];
    return view.since === null
      ? `${label} — par défaut`
      : `${label}, depuis le ${longDay(view.since)}`;
  });

  protected readonly scheduled = computed(() => {
    const next = this.view()?.scheduled ?? null;
    return next === null
      ? null
      : { label: BILLING_RHYTHM_KIND_LABELS[next.mode], effectiveOn: longDay(next.effectiveAt) };
  });

  protected readonly lockedUntil = computed(() => {
    const until = this.view()?.changeLockedUntil ?? null;
    return until === null ? null : longDay(until);
  });

  protected readonly closures = computed(() =>
    (this.view()?.upcomingClosures ?? []).slice(0, SHOWN_CLOSURES).map(closureLine),
  );

  /** Le mode qui fera foi si l'on ne fait rien : le programmé, sinon le courant. */
  private readonly standing = computed(() => {
    const view = this.view();
    return view?.scheduled?.mode ?? view?.mode ?? 'monthly';
  });

  protected readonly canSave = computed(
    () =>
      this.canWrite() &&
      !this.busy() &&
      this.lockedUntil() === null &&
      this.draft() !== this.standing(),
  );

  protected readonly confirmMessage = computed(
    () =>
      `Le nouveau mode prendra effet ${effectiveClosureSentence(this.view()?.upcomingClosures ?? [])}, ` +
      'à la prochaine clôture de son mode actuel. Aucun autre changement ne sera possible avant.',
  );

  constructor() {
    effect(() => {
      const followed = this.followedPayer();
      const id = this.company().id;
      untracked(() => {
        if (followed === null && this.canRead()) {
          void this.load(id);
        }
      });
    });
    effect(() => {
      const standing = this.standing();
      untracked(() => this.draft.set(standing));
    });
  }

  protected async load(companyId: string = this.company().id): Promise<void> {
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
        return;
      }
      this.view.set(await this.api.get(chosen, companyId));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async chooseEntity(entityId: string): Promise<void> {
    this.entityId.set(entityId);
    this.refusal.set(null);
    await this.load();
  }

  protected chooseMode(mode: BillingRhythmKind): void {
    this.draft.set(mode);
  }

  protected async save(): Promise<void> {
    const entityId = this.entityId();
    if (entityId === null || !this.canSave()) {
      return;
    }
    const mode = this.draft();
    await this.act(
      () => this.api.set(entityId, this.company().id, { mode }),
      `Mode « ${BILLING_RHYTHM_KIND_LABELS[mode]} » programmé.`,
    );
  }

  protected async cancelScheduled(): Promise<void> {
    const entityId = this.entityId();
    if (entityId !== null) {
      await this.act(
        () => this.api.cancelScheduled(entityId, this.company().id),
        'Changement de mode annulé.',
      );
    }
  }

  /** Un geste : son refus reste à l'écran avec les mots du serveur ; un succès relit. */
  private async act(gesture: () => Promise<void>, said: string): Promise<void> {
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await gesture();
      this.notify.success(said);
      await this.load();
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Le changement de mode a été refusé.'));
    } finally {
      this.busy.set(false);
    }
  }
}

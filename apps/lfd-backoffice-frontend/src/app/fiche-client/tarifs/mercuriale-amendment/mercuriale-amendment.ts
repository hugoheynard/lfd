import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  Injector,
  type OnInit,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
} from 'fold-ng';
import type {
  AmendCompanyMercurialePayload,
  CompanyPricingCategoryView,
  MercurialeAmendmentPreviewView,
  PosedMercurialeView,
  PromotionView,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';

import { NotifyService } from '../../../notify.service';
import { parisToday } from '../../../shared/paris-today';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import {
  amendmentBody,
  amendmentDiff,
  changeCount,
  defaultEffectDay,
  editOf,
  effectFrom,
  endAllowed,
  previewBody,
  type AmendmentEdit,
} from '../amendment-diff';
import { amendmentRecap } from '../amendment-recap';
import { amendmentRows } from '../amendment-rows';
import { withEuros } from '../draft-prices';
import { discountArticlesOf, discountNames, type GeneralDiscountForm } from '../general-discount';
import type { PromotionPolicyForm } from '../promotion-policy';
import { AmendmentDating } from '../amendment-dating/amendment-dating';
import {
  AMENDMENT_STEPS,
  AmendmentSteps,
  type AmendmentStep,
} from '../amendment-steps/amendment-steps';
import { AmendmentTable, type FirmPriceEdit } from '../amendment-table/amendment-table';
import { GeneralDiscountPicker } from '../general-discount-picker/general-discount-picker';
import { PromotionPolicyPicker } from '../promotion-policy-picker/promotion-policy-picker';

/** Le refus d'un avenant quand un autre est passé entre-temps (§ 2.2). */
const AMENDED_MEANWHILE = 'pricing.mercuriale.amendment.amended_meanwhile';

/** La phrase d'une ligne qui dit quoi faire, par étape. */
const STEP_HINTS: Readonly<Record<AmendmentStep, string>> = {
  1: 'Changez les prix fermes, la remise ou les promotions. Rien n’est enregistré.',
  2: 'Relisez ce que l’avenant change avant de le dater.',
  3: 'Choisissez la date d’effet et dites pourquoi, puis enregistrez.',
};

/**
 * **L'avenant dans la table** (`plan-avenant-dans-la-table.md`) : la table de
 * la mercuriale pré-remplie avec ce qui est en vigueur à la date d'effet, en
 * trois étapes — Modifier, Vérifier, Dater et enregistrer. Un seul avenant,
 * quel que soit le nombre de changements.
 *
 * L'état de référence et les prix d'après viennent de l'aperçu du serveur,
 * appelé à l'ouverture, à la vérification, sur « Recalculer » et quand la
 * date d'effet change — jamais à la frappe. Rien n'est écrit avant
 * « Enregistrer l'avenant », et aucun brouillon n'est gardé : une saisie
 * perdue au rechargement est un choix assumé.
 */
@Component({
  selector: 'app-mercuriale-amendment',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AmendmentDating,
    AmendmentSteps,
    AmendmentTable,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    GeneralDiscountPicker,
    PromotionPolicyPicker,
  ],
  templateUrl: './mercuriale-amendment.html',
  styleUrl: './mercuriale-amendment.scss',
})
export class MercurialeAmendment implements OnInit {
  readonly companyId = input.required<string>();
  readonly mercuriale = input.required<PosedMercurialeView>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();

  /** L'avenant est enregistré : au parent de refermer et de relire. */
  readonly saved = output<void>();
  /** On quitte sans enregistrer. */
  readonly left = output<void>();
  /** Des changements non enregistrés existent — pour la garde de navigation. */
  readonly dirtyChange = output<boolean>();

  private readonly pricing = inject(CompanyPricingService);
  private readonly promotionsApi = inject(PromotionsService);
  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);

  protected readonly today = parisToday();
  protected readonly stepNames = AMENDMENT_STEPS;
  protected readonly stepHints = STEP_HINTS;

  protected readonly loadState = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly step = signal<AmendmentStep>(1);
  protected readonly announcement = signal('');
  protected readonly preview = signal<MercurialeAmendmentPreviewView | null>(null);
  /** Le corps sur lequel l'aperçu a été calculé : « Après » ne le lit que s'il est à jour. */
  private readonly previewKey = signal<string | null>(null);
  protected readonly checking = signal(false);
  protected readonly previewFailed = signal(false);
  protected readonly edit = signal<AmendmentEdit | null>(null);
  protected readonly onlyChanged = signal(false);
  protected readonly fromDay = signal(this.today);
  /** Le champ de la date d'effet est ouvert sur place (étapes 1 et 2). */
  protected readonly editingDate = signal(false);
  /** Le premier jour possible : aujourd'hui, ou le début de la mercuriale s'il est à venir. */
  protected readonly minDay = computed(() =>
    defaultEffectDay(this.mercuriale().validFrom, this.today),
  );
  /** La date d'effet, lue : « aujourd'hui, dès l'enregistrement » ou le jour. */
  protected readonly effectLabel = computed(() =>
    this.fromDay() === this.today
      ? 'aujourd’hui, dès l’enregistrement'
      : `le ${new Date(`${this.fromDay()}T12:00:00`).toLocaleDateString('fr-FR')}`,
  );
  protected readonly toDay = signal('');
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  /** Un refus de l'écran ou du serveur, dit en clair. */
  protected readonly refusal = signal<string | null>(null);
  /** Un autre avenant est passé entre-temps : on propose de recharger. */
  protected readonly amendedMeanwhile = signal(false);
  private readonly promotions = signal<readonly PromotionView[] | null>(null);

  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly verifyButton = viewChild<ElementRef<HTMLElement>>('verifyButton');

  protected readonly state = computed(() => this.preview()?.state ?? null);
  protected readonly diff = computed(() => {
    const state = this.state();
    const edit = this.edit();
    return state === null || edit === null ? null : amendmentDiff(state, edit);
  });
  protected readonly changes = computed(() => {
    const diff = this.diff();
    return diff === null ? 0 : changeCount(diff);
  });
  protected readonly endAllowed = computed(() => {
    const diff = this.diff();
    return diff === null || endAllowed(diff);
  });

  private readonly body = computed(() => {
    const diff = this.diff();
    return diff === null ? null : previewBody(diff, this.fromDay(), this.today);
  });
  private readonly fresh = computed(() => {
    const body = this.body();
    return body !== null && JSON.stringify(body) === this.previewKey();
  });

  protected readonly rows = computed(() => {
    const state = this.state();
    const edit = this.edit();
    const diff = this.diff();
    return state === null || edit === null || diff === null
      ? []
      : amendmentRows(this.categories(), state, edit, diff, this.preview(), this.fresh());
  });
  protected readonly shelfOptions = computed(() => [
    { value: 'all', label: 'Toutes' },
    ...this.categories().map((category) => ({ value: category.id, label: category.name })),
  ]);
  protected readonly beforeLabel = computed(() =>
    this.fromDay() === this.today
      ? 'Aujourd’hui'
      : `Au ${new Date(`${this.fromDay()}T12:00:00`).toLocaleDateString('fr-FR')}`,
  );
  protected readonly firmSkus = computed<ReadonlySet<string>>(
    () => new Set(this.edit()?.firm.keys() ?? []),
  );
  protected readonly recap = computed(() => {
    const state = this.state();
    const edit = this.edit();
    const diff = this.diff();
    if (state === null || edit === null || diff === null) {
      return null;
    }
    return amendmentRecap(diff, state, edit, {
      articles: discountArticlesOf(this.categories()),
      names: discountNames(this.categories()),
      promotions: this.promotions(),
      preview: this.fresh() ? this.preview() : null,
      dearer: this.rows().flatMap((row) =>
        row.dearer && row.after.kind === 'price' && row.beforeMillicents !== null
          ? [
              {
                name: row.name,
                beforeMillicents: row.beforeMillicents,
                afterMillicents: row.after.millicents,
              },
            ]
          : [],
      ),
    });
  });
  /** Un refus de l'aperçu : l'avenant serait refusé, on ne continue pas. */
  protected readonly previewRefused = computed(
    () => this.fresh() && (this.preview()?.refusals.length ?? 0) > 0,
  );

  /** Le refus de l'aperçu, rappelé à l'étape 3 : c'est le premier avertissement. */
  protected readonly refusalWarning = computed(() =>
    this.previewRefused() ? (this.recap()?.warnings[0] ?? null) : null,
  );

  constructor() {
    effect(() => this.dirtyChange.emit(this.changes() > 0));
  }

  ngOnInit(): void {
    this.fromDay.set(defaultEffectDay(this.mercuriale().validFrom, this.today));
    void this.open();
    this.promotionsApi.list().then(
      (list) => this.promotions.set(list.promotions),
      () => this.promotions.set(null),
    );
  }

  /** L'état de départ : la mercuriale à la date d'effet, avant tout changement. */
  protected async open(): Promise<void> {
    this.loadState.set('loading');
    try {
      const preview = await this.pricing.previewAmendment(this.companyId(), this.mercuriale().id, {
        ...effectFrom(this.fromDay(), this.today),
        validTo: null,
        reason: 'Aperçu',
        lines: [],
        endedSkus: [],
      });
      this.preview.set(preview);
      this.previewKey.set(null);
      this.edit.set(editOf(preview.state));
      this.loadState.set('ready');
    } catch {
      this.loadState.set('error');
    }
  }

  /** Relance l'aperçu sur la saisie : il rend l'état à la date d'effet ET les prix d'après. */
  protected async recompute(): Promise<boolean> {
    const body = this.body();
    if (body === null) {
      return false;
    }
    this.checking.set(true);
    try {
      const preview = await this.pricing.previewAmendment(
        this.companyId(),
        this.mercuriale().id,
        body,
      );
      this.preview.set(preview);
      // La clé est le corps ENVOYÉ : si l'état de référence a bougé (autre
      // date, autre avenant), l'écart se recalcule et « Après » redevient local.
      this.previewKey.set(JSON.stringify(body));
      this.previewFailed.set(false);
      return true;
    } catch {
      this.previewFailed.set(true);
      return false;
    } finally {
      this.checking.set(false);
    }
  }

  protected setPrice(change: FirmPriceEdit): void {
    this.edit.update((edit) =>
      edit === null ? edit : { ...edit, firm: withEuros(edit.firm, change.sku, change.euros) },
    );
  }

  protected setTiered(change: { readonly sku: string; readonly removed: boolean }): void {
    this.edit.update((edit) => {
      if (edit === null) {
        return edit;
      }
      const removed = new Set(edit.removedTiered);
      if (change.removed) {
        removed.add(change.sku);
      } else {
        removed.delete(change.sku);
      }
      return { ...edit, removedTiered: removed };
    });
  }

  protected setDiscount(discount: GeneralDiscountForm | null): void {
    this.edit.update((edit) => (edit === null ? edit : { ...edit, discount }));
  }

  protected setPolicy(policy: PromotionPolicyForm): void {
    this.edit.update((edit) => (edit === null ? edit : { ...edit, policy }));
  }

  /** « Vérifier l'avenant » : rien à vérifier sans changement, ni avec une saisie incomplète. */
  protected async verify(): Promise<void> {
    const diff = this.diff();
    if (diff === null) {
      return;
    }
    if (diff.problem !== null) {
      this.refusal.set(diff.problem);
      return;
    }
    if (changeCount(diff) === 0) {
      this.refusal.set('L’avenant ne change rien : modifiez un prix, la remise ou les promotions.');
      return;
    }
    this.refusal.set(null);
    await this.recompute();
    this.goTo(2);
  }

  protected backToTable(): void {
    this.refusal.set(null);
    this.goTo(1);
  }

  protected toDating(): void {
    this.refusal.set(null);
    this.goTo(3);
  }

  /** Changer la date d'effet relance l'aperçu : l'état de référence est celui de cette date. */
  protected async setFromDay(day: string): Promise<void> {
    this.fromDay.set(day === '' ? this.minDay() : day);
    this.editingDate.set(false);
    if (!this.endAllowed()) {
      this.toDay.set('');
    }
    await this.recompute();
  }

  /** « Recharger » après un 409 : l'aperçu repart du dernier avenant, et l'écart se recalcule. */
  protected async reload(): Promise<void> {
    this.amendedMeanwhile.set(false);
    this.refusal.set(null);
    if (await this.recompute()) {
      this.goTo(2);
    }
  }

  protected async save(): Promise<void> {
    const diff = this.diff();
    if (diff === null || this.saving()) {
      return;
    }
    const draft = amendmentBody(diff, {
      fromDay: this.fromDay(),
      toDay: this.endAllowed() ? this.toDay() : '',
      reason: this.reason(),
      today: this.today,
      basedOnAmendmentId: this.preview()?.basedOnAmendmentId ?? null,
    });
    if (!draft.ok) {
      this.refusal.set(draft.refusal);
      return;
    }
    await this.send(draft.payload);
  }

  private async send(payload: AmendCompanyMercurialePayload): Promise<void> {
    this.saving.set(true);
    this.refusal.set(null);
    this.amendedMeanwhile.set(false);
    try {
      await this.pricing.amend(this.companyId(), this.mercuriale().id, payload);
      this.notify.success('Avenant enregistré.');
      this.dirtyChange.emit(false);
      this.saved.emit();
    } catch (error) {
      if (httpErrorCode(error) === AMENDED_MEANWHILE) {
        this.amendedMeanwhile.set(true);
      } else {
        this.refusal.set(httpErrorMessage(error, 'L’avenant n’a pas pu être enregistré.'));
      }
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Change d'étape : l'étape est annoncée (région polie) et le focus va sur
   * son titre. Revenir à la table le rend à « Vérifier l'avenant ».
   */
  private goTo(step: AmendmentStep): void {
    const back = step === 1 && this.step() === 2;
    this.step.set(step);
    this.announcement.set(`Étape ${String(step)} sur 3 : ${AMENDMENT_STEPS[step - 1]}`);
    afterNextRender(() => (back ? this.verifyButton() : this.heading())?.nativeElement.focus(), {
      injector: this.injector,
    });
  }

  /**
   * La barre collante du bas ne doit pas cacher le champ qui a le focus : un
   * champ passé dessous au clavier est ramené au milieu de l'écran.
   */
  protected keepFocusVisible(event: FocusEvent, bar: HTMLElement): void {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.getBoundingClientRect().bottom > bar.getBoundingClientRect().top
    ) {
      target.scrollIntoView({ block: 'center' });
    }
  }
}

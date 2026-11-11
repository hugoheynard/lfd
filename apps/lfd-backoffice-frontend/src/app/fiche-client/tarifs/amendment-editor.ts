import { computed, signal, type Signal } from '@angular/core';
import type {
  AmendCompanyMercurialePayload,
  CompanyPricingCategoryView,
  PromotionView,
} from '@lfd/contracts';
import { httpErrorCode, httpErrorMessage } from '@lfd/endpoints';

import { amendmentBody, previewBody } from './amendment-body';
import { amendmentDiff, changeCount, editOf, type AmendmentEdit } from './amendment-diff';
import { defaultEffectDay, effectFrom, endAllowed } from './amendment-effect';
import { AmendmentPreview, type AmendmentTarget } from './amendment-preview';
import { amendmentRecap } from './amendment-recap';
import { amendmentRows, dearerArticles } from './amendment-rows';
import { withEuros } from './draft-prices';
import type { GeneralDiscountForm } from './general-discount-form';
import { discountNames } from './general-discount-lines';
import { discountArticlesOf } from './general-discount-pricing';
import type { PromotionPolicyForm } from './promotion-policy';

/** Le refus d'un avenant quand un autre est passé entre-temps (§ 2.2). */
const AMENDED_MEANWHILE = 'pricing.mercuriale.amendment.amended_meanwhile';

/** Le motif que l'aperçu d'ouverture exige du contrat ; il n'est jamais écrit. */
const OPENING_REASON = 'Aperçu';

/** Ce que l'éditeur lit de l'écran qui le porte. */
export interface AmendmentEditorSources extends AmendmentTarget {
  readonly listPromotions: () => Promise<{ readonly promotions: readonly PromotionView[] }>;
  readonly categories: Signal<readonly CompanyPricingCategoryView[]>;
  /** Aujourd'hui à Paris, `AAAA-MM-JJ`. */
  readonly today: string;
}

/** `2026-11-11` → `11/11/2026`, lu à midi pour qu'aucun fuseau ne change le jour. */
function frenchDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR');
}

/**
 * **L'état d'un avenant en cours** (`documentation/pricing/mercuriales/l-avenant-date.md`) :
 * la saisie, l'aperçu du serveur et sa fraîcheur, la date d'effet, l'envoi et
 * le 409 de concurrence. Une classe de signaux, une instance par écran : le
 * composant ne garde que la liaison au gabarit, les étapes et le focus.
 *
 * L'aperçu est appelé à l'ouverture, à la vérification, sur « Recalculer » et
 * quand la date d'effet change — jamais à la frappe. Rien n'est écrit avant
 * `save`, et aucun brouillon n'est gardé.
 */
export class AmendmentEditor {
  private readonly server: AmendmentPreview;
  readonly loadState: AmendmentPreview['loadState'];
  readonly preview: AmendmentPreview['view'];
  readonly checking: AmendmentPreview['checking'];
  readonly previewFailed: AmendmentPreview['failed'];
  readonly edit = signal<AmendmentEdit | null>(null);
  readonly fromDay = signal('');
  /** Le champ de la date d'effet est ouvert sur place (étapes 1 et 2). */
  readonly editingDate = signal(false);
  /** La date en cours de saisie, appliquée seulement par « Appliquer ». */
  readonly draftDay = signal('');
  readonly toDay = signal('');
  readonly reason = signal('');
  readonly saving = signal(false);
  /** Un refus de l'écran ou du serveur, dit en clair. */
  readonly refusal = signal<string | null>(null);
  /** Un autre avenant est passé entre-temps : on propose de recharger. */
  readonly amendedMeanwhile = signal(false);
  private readonly promotions = signal<readonly PromotionView[] | null>(null);

  /** Le premier jour possible : aujourd'hui, ou le début de la mercuriale s'il est à venir. */
  readonly minDay = computed(() =>
    defaultEffectDay(this.sources.mercuriale().validFrom, this.sources.today),
  );
  /** La date d'effet, lue : « aujourd'hui, dès l'enregistrement » ou le jour. */
  readonly effectLabel = computed(() =>
    this.fromDay() === this.sources.today
      ? 'aujourd’hui, dès l’enregistrement'
      : `le ${frenchDay(this.fromDay())}`,
  );
  readonly beforeLabel = computed(() =>
    this.fromDay() === this.sources.today ? 'Aujourd’hui' : `Au ${frenchDay(this.fromDay())}`,
  );

  readonly state = computed(() => this.preview()?.state ?? null);
  readonly diff = computed(() => {
    const state = this.state();
    const edit = this.edit();
    return state === null || edit === null ? null : amendmentDiff(state, edit);
  });
  readonly changes = computed(() => {
    const diff = this.diff();
    return diff === null ? 0 : changeCount(diff);
  });
  readonly endAllowed = computed(() => {
    const diff = this.diff();
    return diff === null || endAllowed(diff);
  });

  private readonly body = computed(() => {
    const diff = this.diff();
    return diff === null ? null : previewBody(diff, this.fromDay(), this.sources.today);
  });
  private readonly fresh = computed(() => this.server.isFreshFor(this.body()));

  readonly rows = computed(() => {
    const state = this.state();
    const edit = this.edit();
    const diff = this.diff();
    return state === null || edit === null || diff === null
      ? []
      : amendmentRows(this.sources.categories(), state, edit, diff, this.preview(), this.fresh());
  });
  readonly shelfOptions = computed(() => [
    { value: 'all', label: 'Toutes' },
    ...this.sources.categories().map((category) => ({ value: category.id, label: category.name })),
  ]);
  readonly firmSkus = computed<ReadonlySet<string>>(() => new Set(this.edit()?.firm.keys() ?? []));
  readonly recap = computed(() => {
    const state = this.state();
    const edit = this.edit();
    const diff = this.diff();
    if (state === null || edit === null || diff === null) {
      return null;
    }
    return amendmentRecap(diff, state, edit, {
      articles: discountArticlesOf(this.sources.categories()),
      names: discountNames(this.sources.categories()),
      promotions: this.promotions(),
      preview: this.fresh() ? this.preview() : null,
      dearer: dearerArticles(this.rows()),
    });
  });
  /** Un refus de l'aperçu : l'avenant serait refusé, on ne continue pas. */
  readonly previewRefused = computed(
    () => this.fresh() && (this.preview()?.refusals.length ?? 0) > 0,
  );
  /** Le refus de l'aperçu, rappelé à l'étape 3 : c'est le premier avertissement. */
  readonly refusalWarning = computed(() =>
    this.previewRefused() ? (this.recap()?.warnings[0] ?? null) : null,
  );

  constructor(private readonly sources: AmendmentEditorSources) {
    this.server = new AmendmentPreview(sources);
    this.loadState = this.server.loadState;
    this.preview = this.server.view;
    this.checking = this.server.checking;
    this.previewFailed = this.server.failed;
    this.fromDay.set(sources.today);
  }

  /** Ouvre l'avenant à sa date d'effet par défaut, et lit les promotions pour le récapitulatif. */
  async start(): Promise<void> {
    this.fromDay.set(this.minDay());
    const opening = this.open();
    this.sources.listPromotions().then(
      (list) => this.promotions.set(list.promotions),
      () => this.promotions.set(null),
    );
    await opening;
  }

  /** L'état de départ : la mercuriale à la date d'effet, avant tout changement. */
  async open(): Promise<void> {
    const view = await this.server.open({
      ...effectFrom(this.fromDay(), this.sources.today),
      validTo: null,
      reason: OPENING_REASON,
      lines: [],
      endedSkus: [],
    });
    if (view !== null) {
      this.edit.set(editOf(view.state));
    }
  }

  /** Relance l'aperçu sur la saisie : il rend l'état à la date d'effet ET les prix d'après. */
  async recompute(): Promise<boolean> {
    const body = this.body();
    if (body === null) {
      return false;
    }
    return this.server.refresh(body);
  }

  setPrice(sku: string, euros: number | null): void {
    this.edit.update((edit) =>
      edit === null ? edit : { ...edit, firm: withEuros(edit.firm, sku, euros) },
    );
  }

  setTiered(sku: string, removed: boolean): void {
    this.edit.update((edit) => {
      if (edit === null) {
        return edit;
      }
      const next = new Set(edit.removedTiered);
      if (removed) {
        next.add(sku);
      } else {
        next.delete(sku);
      }
      return { ...edit, removedTiered: next };
    });
  }

  setDiscount(discount: GeneralDiscountForm | null): void {
    this.edit.update((edit) => (edit === null ? edit : { ...edit, discount }));
  }

  setPolicy(policy: PromotionPolicyForm): void {
    this.edit.update((edit) => (edit === null ? edit : { ...edit, policy }));
  }

  openDate(): void {
    this.draftDay.set(this.fromDay());
    this.editingDate.set(true);
  }

  /**
   * « Vérifier l'avenant » : rien à vérifier sans changement, ni avec une
   * saisie incomplète. `true` = l'aperçu est relancé, on passe à l'étape 2.
   */
  async verify(): Promise<boolean> {
    const diff = this.diff();
    if (diff === null) {
      return false;
    }
    if (diff.problem !== null) {
      this.refusal.set(diff.problem);
      return false;
    }
    if (changeCount(diff) === 0) {
      this.refusal.set('L’avenant ne change rien : modifiez un prix, la remise ou les promotions.');
      return false;
    }
    this.refusal.set(null);
    await this.recompute();
    return true;
  }

  /** Changer la date d'effet relance l'aperçu : l'état de référence est celui de cette date. */
  async setFromDay(day: string): Promise<void> {
    this.fromDay.set(day === '' ? this.minDay() : day);
    this.editingDate.set(false);
    if (!this.endAllowed()) {
      this.toDay.set('');
    }
    await this.recompute();
  }

  /** « Recharger » après un 409 : l'aperçu repart du dernier avenant. `true` = il a répondu. */
  async reload(): Promise<boolean> {
    this.amendedMeanwhile.set(false);
    this.refusal.set(null);
    return this.recompute();
  }

  /** Enregistre l'avenant ; `true` = il est écrit. */
  async save(): Promise<boolean> {
    const diff = this.diff();
    if (diff === null || this.saving()) {
      return false;
    }
    const draft = amendmentBody(diff, {
      fromDay: this.fromDay(),
      toDay: this.endAllowed() ? this.toDay() : '',
      reason: this.reason(),
      today: this.sources.today,
      basedOnAmendmentId: this.preview()?.basedOnAmendmentId ?? null,
    });
    if (!draft.ok) {
      this.refusal.set(draft.refusal);
      return false;
    }
    return this.send(draft.payload);
  }

  private async send(payload: AmendCompanyMercurialePayload): Promise<boolean> {
    this.saving.set(true);
    this.refusal.set(null);
    this.amendedMeanwhile.set(false);
    try {
      await this.sources.api.amend(this.sources.companyId(), this.sources.mercuriale().id, payload);
      return true;
    } catch (error) {
      if (httpErrorCode(error) === AMENDED_MEANWHILE) {
        this.amendedMeanwhile.set(true);
      } else {
        this.refusal.set(httpErrorMessage(error, 'L’avenant n’a pas pu être enregistré.'));
      }
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}

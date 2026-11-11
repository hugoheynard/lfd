import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  Injector,
  type OnInit,
  afterNextRender,
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
import type { CompanyPricingCategoryView, PosedMercurialeView } from '@lfd/contracts';

import { NotifyService } from '../../../notify.service';
import { parisToday } from '../../../shared/paris-today';
import { PromotionsService } from '../../../targeted-promotions/promotions.service';
import { CompanyPricingService } from '../company-pricing.service';
import { AmendmentEditor } from '../amendment-editor';
import type { GeneralDiscountForm } from '../general-discount-form';
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

/** La phrase d'une ligne qui dit quoi faire, par étape. */
const STEP_HINTS: Readonly<Record<AmendmentStep, string>> = {
  1: 'Changez les prix fermes, la remise ou les promotions. Rien n’est enregistré.',
  2: 'Relisez ce que l’avenant change avant de le dater.',
  3: 'Choisissez la date d’effet et dites pourquoi, puis enregistrez.',
};

/**
 * **L'avenant dans la table** (`l-avenant-date.md`) : la table de
 * la mercuriale pré-remplie avec ce qui est en vigueur à la date d'effet, en
 * trois étapes — Modifier, Vérifier, Dater et enregistrer. Un seul avenant,
 * quel que soit le nombre de changements.
 *
 * L'état, l'aperçu et l'envoi vivent dans {@link AmendmentEditor} ; le
 * composant lie le gabarit, mène les étapes, annonce et place le focus.
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

  private readonly notify = inject(NotifyService);
  private readonly injector = inject(Injector);
  private readonly promotionsApi = inject(PromotionsService);

  private readonly editor = new AmendmentEditor({
    api: inject(CompanyPricingService),
    listPromotions: () => this.promotionsApi.list(),
    companyId: this.companyId,
    mercuriale: this.mercuriale,
    categories: this.categories,
    today: parisToday(),
  });

  protected readonly stepNames = AMENDMENT_STEPS;
  protected readonly stepHints = STEP_HINTS;
  protected readonly step = signal<AmendmentStep>(1);
  protected readonly announcement = signal('');
  protected readonly onlyChanged = signal(false);

  protected readonly loadState = this.editor.loadState;
  protected readonly checking = this.editor.checking;
  protected readonly previewFailed = this.editor.previewFailed;
  protected readonly edit = this.editor.edit;
  protected readonly fromDay = this.editor.fromDay;
  protected readonly editingDate = this.editor.editingDate;
  protected readonly draftDay = this.editor.draftDay;
  protected readonly draftTooEarly = this.editor.draftTooEarly;
  protected readonly minDayLabel = this.editor.minDayLabel;
  protected readonly minDay = this.editor.minDay;
  protected readonly effectLabel = this.editor.effectLabel;
  protected readonly beforeLabel = this.editor.beforeLabel;
  protected readonly toDay = this.editor.toDay;
  protected readonly reason = this.editor.reason;
  protected readonly saving = this.editor.saving;
  protected readonly refusal = this.editor.refusal;
  protected readonly amendedMeanwhile = this.editor.amendedMeanwhile;
  protected readonly changes = this.editor.changes;
  protected readonly endAllowed = this.editor.endAllowed;
  protected readonly rows = this.editor.rows;
  protected readonly shelfOptions = this.editor.shelfOptions;
  protected readonly firmSkus = this.editor.firmSkus;
  protected readonly recap = this.editor.recap;
  protected readonly previewRefused = this.editor.previewRefused;
  protected readonly refusalWarning = this.editor.refusalWarning;

  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly verifyButton = viewChild<ElementRef<HTMLElement>>('verifyButton');

  constructor() {
    effect(() => this.dirtyChange.emit(this.changes() > 0));
  }

  ngOnInit(): void {
    void this.editor.start();
  }

  protected open(): Promise<void> {
    return this.editor.open();
  }

  protected recompute(): Promise<boolean> {
    return this.editor.recompute();
  }

  protected openDate(): void {
    this.editor.openDate();
  }

  protected setPrice(change: FirmPriceEdit): void {
    this.editor.setPrice(change.sku, change.euros);
  }

  protected setTiered(change: { readonly sku: string; readonly removed: boolean }): void {
    this.editor.setTiered(change.sku, change.removed);
  }

  protected setDiscount(discount: GeneralDiscountForm | null): void {
    this.editor.setDiscount(discount);
  }

  protected setPolicy(policy: PromotionPolicyForm): void {
    this.editor.setPolicy(policy);
  }

  protected setFromDay(day: string): Promise<void> {
    return this.editor.setFromDay(day);
  }

  /** « Vérifier l'avenant » : l'étape 2 seulement si l'éditeur l'accepte. */
  protected async verify(): Promise<void> {
    if (await this.editor.verify()) {
      this.goTo(2);
    }
  }

  protected backToTable(): void {
    this.refusal.set(null);
    this.goTo(1);
  }

  protected toDating(): void {
    this.refusal.set(null);
    this.goTo(3);
  }

  /** « Recharger » après un 409 : revient à la vérification si l'aperçu a répondu. */
  protected async reload(): Promise<void> {
    if (await this.editor.reload()) {
      this.goTo(2);
    }
  }

  protected async save(): Promise<void> {
    if (await this.editor.save()) {
      this.notify.success('Avenant enregistré.');
      this.dirtyChange.emit(false);
      this.saved.emit();
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

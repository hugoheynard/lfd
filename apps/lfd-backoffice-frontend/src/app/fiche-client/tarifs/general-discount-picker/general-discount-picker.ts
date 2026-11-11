import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import type { CompanyPricingCategoryView, GeneralDiscountModeValue } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldComboboxComponent,
  FoldElementTitleComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import {
  DISCOUNT_MODE_LABELS,
  NEW_GENERAL_DISCOUNT,
  bpOfPercent,
  discountArticlesOf,
  discountFamiliesOf,
  discountLineRows,
  discountNames,
  discountProblem,
  discountViewOf,
  discountedArticles,
  percentOfBp,
  withDiscountLine,
  withDiscountLineChange,
  withoutDiscountLine,
  type DiscountLineForm,
  type GeneralDiscountForm,
} from '../general-discount';

const MODES: readonly GeneralDiscountModeValue[] = ['all_except', 'only'];

const MODE_HINTS: Readonly<Record<GeneralDiscountModeValue, string>> = {
  all_except:
    'Le taux de base vaut pour tout le catalogue ; une ligne le change ou exclut sa famille ou son article.',
  only: 'Seules les lignes qui portent un taux sont remisées ; le reste paie le tarif.',
};

/**
 * **« Remise générale »** — un pourcentage du prix de base, par famille et par
 * article, avec ses exclusions (`plan-remise-generale.md`, § 5 et « Un taux
 * par famille »). À la pose, sur le brouillon et sur l'avenant.
 *
 * `null` = pas de remise. Le prix ferme d'un article l'emporte toujours :
 * `firmSkus` sert à le dire dans le compte.
 */
@Component({
  selector: 'app-general-discount-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldComboboxComponent,
    FoldElementTitleComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './general-discount-picker.html',
  styleUrl: './general-discount-picker.scss',
})
export class GeneralDiscountPicker {
  readonly discount = model.required<GeneralDiscountForm | null>();
  readonly categories = input.required<readonly CompanyPricingCategoryView[]>();
  /** Les articles à prix ferme : la remise ne les touche pas. */
  readonly firmSkus = input<ReadonlySet<string>>(new Set());

  protected readonly modeOptions: readonly FoldViewToggleOption[] = MODES.map((mode) => ({
    value: mode,
    label: DISCOUNT_MODE_LABELS[mode],
  }));
  protected readonly rateOptions: readonly FoldViewToggleOption[] = [
    { value: 'rate', label: 'Taux' },
    { value: 'excluded', label: 'Exclue' },
  ];
  protected readonly percentOf = percentOfBp;
  protected readonly familyToAdd = signal<string | null>(null);

  private readonly articles = computed(() => discountArticlesOf(this.categories()));
  private readonly families = computed(() => discountFamiliesOf(this.categories()));
  private readonly names = computed(() => discountNames(this.categories()));

  protected readonly modeHint = computed(() => {
    const form = this.discount();
    return form === null ? '' : MODE_HINTS[form.mode];
  });

  protected readonly problem = computed(() => discountProblem(this.discount()));

  /** « N articles concernés sur M », comme la portée d'une promotion. */
  protected readonly subtitle = computed(() => {
    const form = this.discount();
    if (form === null) {
      return 'Aucune : les prix fermes seuls font la mercuriale.';
    }
    const view = discountViewOf(form);
    if (view === null) {
      return 'À compléter';
    }
    const articles = this.articles();
    const reached = discountedArticles(view, articles, new Set());
    const covered = reached.size;
    const firm = [...reached.keys()].filter((sku) => this.firmSkus().has(sku)).length;
    const kept = firm > 0 ? ` · ${String(firm)} gardent leur prix ferme` : '';
    return `${String(covered)} article(s) concerné(s) sur ${String(articles.length)}${kept}`;
  });

  protected readonly lines = computed(() => {
    const form = this.discount();
    return form === null
      ? []
      : discountLineRows(form, this.families(), this.articles(), this.names());
  });

  protected readonly addableFamilies = computed(() => {
    const taken = new Set(this.discount()?.lines.map((line) => line.targetId) ?? []);
    return this.families()
      .filter((family) => !taken.has(family.id))
      .map((family) => ({
        value: family.id,
        label: family.path.length > 1 ? `${family.name} (sous-famille)` : family.name,
      }));
  });

  protected readonly addableArticles = computed(() => {
    const taken = new Set(this.discount()?.lines.map((line) => line.targetId) ?? []);
    return this.articles()
      .filter((article) => !taken.has(article.sku))
      .map((article) => ({ value: article.sku, label: `${article.name} — ${article.sku}` }));
  });

  protected toggle(on: boolean): void {
    this.discount.set(on ? NEW_GENERAL_DISCOUNT : null);
  }

  protected setMode(value: string): void {
    const mode = MODES.find((candidate) => candidate === value);
    this.update((form) => (mode === undefined ? form : { ...form, mode }));
  }

  protected setBase(percent: number | null): void {
    this.update((form) => ({ ...form, baseBp: bpOfPercent(percent) }));
  }

  protected addFamily(familyId: string | null): void {
    if (familyId !== null) {
      this.update((form) => withDiscountLine(form, 'category', familyId));
    }
    this.familyToAdd.set(null);
  }

  protected addArticle(sku: string | null): void {
    if (sku !== null) {
      this.update((form) => withDiscountLine(form, 'variant', sku));
    }
  }

  protected remove(line: DiscountLineForm): void {
    this.update((form) => withoutDiscountLine(form, line));
  }

  protected setExcluded(line: DiscountLineForm, value: string): void {
    this.update((form) => withDiscountLineChange(form, line, { excluded: value === 'excluded' }));
  }

  protected setRate(line: DiscountLineForm, percent: number | null): void {
    this.update((form) => withDiscountLineChange(form, line, { bp: bpOfPercent(percent) }));
  }

  private update(change: (form: GeneralDiscountForm) => GeneralDiscountForm): void {
    const form = this.discount();
    if (form !== null) {
      this.discount.set(change(form));
    }
  }
}

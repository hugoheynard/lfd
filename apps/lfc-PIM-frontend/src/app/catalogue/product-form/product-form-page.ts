import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldNavLayoutComponent,
  FoldOptionComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { formatPercent } from '../../data/channels';
import type {
  AllergenEntry,
  AllergenScope,
  Category,
  ProductKind,
  TvaRegime,
} from '../../data/models';
import { CatalogueApi } from '../catalogue-api';
import { ReferenceApi } from '../reference-api';
import {
  ProductHttpApi,
  type EditorialFields,
  type NutritionValues,
} from '../product-http-api';

type SectionStatus = 'saving' | 'saved' | 'error';

interface AllergenGroup {
  readonly incoLabel: string;
  readonly entries: readonly AllergenEntry[];
}

const KINDS: readonly { value: ProductKind; label: string }[] = [
  { value: 'daily', label: 'Frais du jour' },
  { value: 'made_to_order', label: 'Sur commande' },
  { value: 'resale', label: 'Revente' },
];

const NUTRITION_FIELDS: readonly { key: keyof NutritionValues; label: string }[] =
  [
    { key: 'energyKcal', label: 'Calories (kcal)' },
    { key: 'carbsG', label: 'Glucides (g)' },
    { key: 'fatG', label: 'Lipides (g)' },
    { key: 'proteinG', label: 'Protéines (g)' },
    { key: 'glycemicIndex', label: 'Indice glycémique' },
  ];

const EDITORIAL_FIELDS: readonly { key: keyof EditorialFields; label: string }[] =
  [
    { key: 'descriptionShort', label: 'Résumé court' },
    { key: 'brand', label: 'Marque / gamme' },
    { key: 'seoTitle', label: 'Titre SEO' },
    { key: 'seoDescription', label: 'Description SEO' },
  ];

/**
 * Formulaire produit **unique**, paramétré par mode. Une seule page pour créer
 * et éditer : mêmes sections en onglets. Ce qui change selon le mode :
 * - **create** : champs vierges, un seul bouton « Créer le brouillon » en bas ;
 * - **edit** : on hydrate depuis le backend, et chaque section s'enregistre
 *   indépendamment (un save par section, dans la carte).
 * Canaux & TVA sont en lecture seule (hérités de la catégorie ; l'override par
 * produit relève du contexte commerce). Allergènes + nutrition = une seule fiche.
 */
@Component({
  selector: 'app-product-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldCheckboxComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
  ],
  templateUrl: './product-form-page.html',
  styleUrl: './product-form-page.scss',
})
export class ProductFormPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly products = inject(ProductHttpApi);
  private readonly api = inject(CatalogueApi);
  private readonly reference = inject(ReferenceApi);

  protected readonly kinds = KINDS;
  protected readonly nutritionFields = NUTRITION_FIELDS;
  protected readonly editorialFields = EDITORIAL_FIELDS;
  protected readonly scopes = [
    { value: 'eu' as const, label: 'UE / France' },
    { value: 'world' as const, label: 'Monde' },
  ];
  protected readonly mediaRoles = [
    { value: 'hero', label: 'Principale' },
    { value: 'gallery', label: 'Galerie' },
    { value: 'lifestyle', label: 'Ambiance' },
    { value: 'thumbnail', label: 'Miniature' },
    { value: 'print', label: 'Impression' },
  ];
  protected readonly tabs: FoldTabItem[] = [
    { key: 'identite', label: 'Identité', icon: 'grid' },
    { key: 'tarif', label: 'Tarif & logistique', icon: 'tag' },
    { key: 'canaux', label: 'Canaux & TVA', icon: 'sliders' },
    { key: 'fiche', label: 'Allergènes & nutrition', icon: 'shield' },
    { key: 'communication', label: 'Communication', icon: 'edit' },
    { key: 'visuels', label: 'Visuels', icon: 'eye' },
  ];
  protected readonly activeTab = signal<string>('identite');

  private readonly productId = signal('');
  private readonly variantId = signal('');
  protected readonly isEdit = signal(false);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly categories = signal<Category[]>([]);
  protected readonly regimes = signal<TvaRegime[]>([]);
  protected readonly entries = signal<AllergenEntry[]>([]);
  protected readonly provisional = signal(false);

  // Champs
  protected readonly name = signal('');
  protected readonly kind = signal<ProductKind>('daily');
  protected readonly categoryId = signal('');
  protected readonly sku = signal('');
  protected readonly priceEur = signal<number | null>(null);
  protected readonly weightGrams = signal<number | null>(null);
  protected readonly scope = signal<AllergenScope>('eu');
  protected readonly selected = signal<string[]>([]);
  protected readonly declaresNone = signal(false);
  protected readonly nutrition = signal<NutritionValues>({
    energyKcal: null,
    carbsG: null,
    fatG: null,
    proteinG: null,
    glycemicIndex: null,
  });
  protected readonly editorial = signal<EditorialFields>({
    descriptionShort: '',
    descriptionLong: '',
    story: '',
    pairing: '',
    brand: '',
    seoTitle: '',
    seoDescription: '',
  });
  protected readonly media = signal<
    { role: string; url: string; alt?: string }[]
  >([]);

  private readonly status = signal<Record<string, SectionStatus | undefined>>(
    {},
  );

  protected readonly pageTitle = computed(() =>
    this.isEdit() ? 'Éditer le produit' : 'Nouveau produit',
  );

  private readonly regimeById = computed(
    () => new Map(this.regimes().map((r) => [r.id, r])),
  );

  protected readonly selectedCategory = computed<Category | undefined>(() =>
    this.categories().find((c) => c.id === this.categoryId()),
  );

  /** TVA héritée de la catégorie : « Réduit 5,5 % → Intermédiaire 10 % ». */
  protected readonly categoryTva = computed(() => {
    const category = this.selectedCategory();
    if (category === undefined) {
      return null;
    }
    const label = (id: string): string => {
      const regime = this.regimeById().get(id);
      return regime === undefined
        ? '—'
        : `${regime.name} · ${formatPercent(regime.percent)}`;
    };
    return {
      emporter: label(category.emporterTvaId),
      surPlace: label(category.surPlaceTvaId),
    };
  });

  protected readonly groups = computed<AllergenGroup[]>(() => {
    const byLabel = new Map<string, AllergenEntry[]>();
    for (const entry of this.entries()) {
      const key = entry.incoLabel ?? 'Hors obligation UE';
      const bucket = byLabel.get(key);
      if (bucket === undefined) {
        byLabel.set(key, [entry]);
      } else {
        bucket.push(entry);
      }
    }
    return [...byLabel.entries()].map(([incoLabel, group]) => ({
      incoLabel,
      entries: group,
    }));
  });

  constructor() {
    void this.load();
  }

  protected declaresSomething(): boolean {
    return this.declaresNone() || this.selected().length > 0;
  }

  protected statusText(section: string): string {
    switch (this.status()[section]) {
      case 'saving':
        return 'Enregistrement…';
      case 'saved':
        return 'Enregistré ✓';
      case 'error':
        return 'Échec';
      default:
        return '';
    }
  }

  protected isValid(): boolean {
    return this.name().trim() !== '' && this.categoryId() !== '';
  }

  protected numberValue(event: Event): number | null {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.value.trim() === '') {
      return null;
    }
    const parsed = Number(target.value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  protected text(event: Event): string {
    return event.target instanceof HTMLTextAreaElement ? event.target.value : '';
  }

  protected setKind(value: string): void {
    if (this.isKind(value)) {
      this.kind.set(value);
    }
  }

  protected setCategory(value: string): void {
    if (value !== '') {
      this.categoryId.set(value);
    }
  }

  protected editorialValue(key: keyof EditorialFields): string {
    return this.editorial()[key];
  }

  protected setEditorial(key: keyof EditorialFields, value: string): void {
    this.editorial.update((current) => ({ ...current, [key]: value }));
  }

  protected nutritionValue(key: keyof NutritionValues): number | null {
    return this.nutrition()[key];
  }

  protected setNutrition(key: keyof NutritionValues, value: number | null): void {
    this.nutrition.update((current) => ({ ...current, [key]: value }));
  }

  protected toggle(code: string, on: boolean): void {
    this.selected.update((current) =>
      on ? [...current, code] : current.filter((entry) => entry !== code),
    );
  }

  protected toggleNone(on: boolean): void {
    this.declaresNone.set(on);
    if (on) {
      this.selected.set([]);
    }
  }

  protected async changeScope(scope: AllergenScope): Promise<void> {
    this.scope.set(scope);
    await this.loadReference(scope);
  }

  protected addMedia(): void {
    this.media.update((current) => [
      ...current,
      { role: current.length === 0 ? 'hero' : 'gallery', url: '' },
    ]);
  }

  protected removeMedia(index: number): void {
    this.media.update((current) =>
      current.filter((_, position) => position !== index),
    );
  }

  protected setMedia(
    index: number,
    key: 'role' | 'url' | 'alt',
    value: string,
  ): void {
    this.media.update((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, [key]: value } : slot,
      ),
    );
  }

  protected back(): void {
    void this.router.navigate(['/produits']);
  }

  // ── Create : un seul submit ──────────────────────────────────────────────

  protected async submit(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const sku = this.sku().trim();
      const price = this.priceEur();
      const weight = this.weightGrams();
      const description = this.editorial().descriptionShort.trim();
      const created = await this.api.createProduct({
        nameFr: this.name().trim(),
        kind: this.kind(),
        categoryId: this.categoryId(),
        ...(sku === '' ? {} : { sku }),
        ...(this.declaresSomething() ? { allergens: this.selected() } : {}),
        ...(price === null ? {} : { priceEur: price }),
        ...(weight === null ? {} : { weightGrams: weight }),
        ...(description === '' ? {} : { descriptionFr: description }),
      });
      // On enchaîne sur l'édition : le reste (nutrition, SEO, visuels) s'y complète.
      await this.router.navigate(['/produits', created.id]);
    } catch (caught) {
      this.error.set(this.messageOf(caught));
    } finally {
      this.busy.set(false);
    }
  }

  // ── Edit : un save par section ───────────────────────────────────────────

  protected saveIdentity(): Promise<void> {
    if (!this.isValid()) {
      return Promise.resolve();
    }
    return this.save('identite', () =>
      this.products.saveIdentity(this.productId(), {
        nameFr: this.name().trim(),
        kind: this.kind(),
        categoryId: this.categoryId(),
      }),
    );
  }

  protected savePricing(): Promise<void> {
    const price = this.priceEur();
    const weight = this.weightGrams();
    return this.save('tarif', () =>
      this.products.savePricing(this.productId(), this.variantId(), {
        priceCents: price === null ? null : Math.round(price * 100),
        weightGrams: weight === null ? null : Math.round(weight),
      }),
    );
  }

  protected saveFiche(): Promise<void> {
    return this.save('fiche', () =>
      this.products.saveNutrition(this.productId(), this.variantId(), {
        allergens: this.declaresNone() ? [] : this.selected(),
        nutrition: this.nutrition(),
      }),
    );
  }

  protected saveCommunication(): Promise<void> {
    return this.save('communication', () =>
      this.products.saveEditorial(this.productId(), this.editorial()),
    );
  }

  private isKind(value: string): value is ProductKind {
    return value === 'daily' || value === 'made_to_order' || value === 'resale';
  }

  private messageOf(caught: unknown): string {
    return caught instanceof Error ? caught.message : 'Erreur inattendue.';
  }

  private async save(
    section: string,
    action: () => Promise<void>,
  ): Promise<void> {
    this.status.update((current) => ({ ...current, [section]: 'saving' }));
    this.error.set(null);
    try {
      await action();
      this.status.update((current) => ({ ...current, [section]: 'saved' }));
    } catch (caught) {
      this.status.update((current) => ({ ...current, [section]: 'error' }));
      this.error.set(this.messageOf(caught));
    }
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEdit.set(id !== null);
    this.productId.set(id ?? '');
    this.loading.set(true);
    try {
      const [categories, regimes] = await Promise.all([
        this.api.listCategories(),
        this.api.listTvaRegimes(),
      ]);
      const active = categories.filter((category) => !category.isArchived);
      this.categories.set(active);
      this.regimes.set(regimes);
      await this.loadReference('eu');
      if (id === null) {
        const first = active[0];
        if (first !== undefined) {
          this.categoryId.set(first.id);
        }
        return;
      }
      await this.hydrate(id);
    } catch (caught) {
      this.error.set(this.messageOf(caught));
    } finally {
      this.loading.set(false);
    }
  }

  private async hydrate(id: string): Promise<void> {
    const detail = await this.products.getDetail(id);
    if (detail === null) {
      this.notFound.set(true);
      return;
    }
    const product = detail.product;
    this.sku.set(product.sku);
    this.name.set(product.name.fr);
    this.kind.set(product.kind);
    this.categoryId.set(product.categoryId);
    this.priceEur.set(product.priceEur ?? null);
    this.weightGrams.set(product.weightGrams ?? null);
    this.editorial.set(detail.editorial);
    this.nutrition.set(detail.nutrition);
    const variant =
      product.variants.find((entry) => entry.isDefault) ?? product.variants[0];
    this.variantId.set(variant?.id ?? '');
    const allergens = detail.allergens;
    if (allergens === null) {
      this.declaresNone.set(false);
      this.selected.set([]);
    } else if (allergens.length === 0) {
      this.declaresNone.set(true);
    } else {
      this.selected.set([...allergens]);
    }
  }

  private async loadReference(scope: AllergenScope): Promise<void> {
    const reference = await this.reference.allergens(scope);
    this.entries.set(reference.entries);
    this.provisional.set(reference.hasProvisionalCodes);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldOptionComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import {
  formatPercent,
  generateFiches,
  type GeneratedFiche,
} from '../../data/channels';
import { LocalDb } from '../../data/local-db';
import { productSkuRoot, slugify } from '../../data/sku';
import type {
  AllergenEntry,
  AllergenScope,
  Category,
  Product,
  ProductKind,
  ProductStatus,
  SalesChannels,
  TvaRegime,
} from '../../data/models';
import { ChannelMatrix } from '../channel-matrix/channel-matrix';
import { CatalogueApi } from '../catalogue-api';
import { ReferenceApi } from '../reference-api';

interface AllergenGroup {
  readonly incoLabel: string;
  readonly entries: readonly AllergenEntry[];
}

const KIND_LABELS: Record<ProductKind, string> = {
  daily: 'Frais du jour',
  made_to_order: 'Sur commande',
  resale: 'Revente',
};

const STATUS_LABELS: Record<ProductStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  archived: 'Archivé',
};

const NO_CHANNELS: SalesChannels = {
  b1: { emporter: false, surPlace: false },
  b2: { emporter: false, surPlace: false },
};

/**
 * Créer un produit — une page dédiée, une section soignée par **type
 * d'information**. La section Canaux & TVA montre en direct les fiches Shopify
 * que le produit générera.
 */
@Component({
  selector: 'app-create-product-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldBadgeComponent,
    FoldIconComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    ChannelMatrix,
  ],
  templateUrl: './create-product-page.html',
  styleUrl: './create-product-page.scss',
})
export class CreateProductPage {
  private readonly api = inject(CatalogueApi);
  private readonly reference = inject(ReferenceApi);
  private readonly db = inject(LocalDb);
  private readonly router = inject(Router);

  protected readonly kinds: readonly ProductKind[] = [
    'daily',
    'made_to_order',
    'resale',
  ];
  protected readonly scopes = [
    { value: 'eu' as const, label: 'UE / France' },
    { value: 'world' as const, label: 'Monde' },
  ];
  protected readonly nutritionFields = [
    { key: 'energyKcal' as const, label: 'Calories (kcal)' },
    { key: 'carbsG' as const, label: 'Glucides (g)' },
    { key: 'fatG' as const, label: 'Lipides (g)' },
    { key: 'proteinG' as const, label: 'Protéines (g)' },
    { key: 'glycemicIndex' as const, label: 'Indice glycémique' },
  ];
  protected readonly mediaRoles = [
    { value: 'hero', label: 'Principale' },
    { value: 'gallery', label: 'Galerie' },
    { value: 'lifestyle', label: 'Ambiance' },
    { value: 'thumbnail', label: 'Miniature' },
    { value: 'print', label: 'Impression' },
  ];

  protected readonly categories = signal<Category[]>([]);
  protected readonly regimes = signal<TvaRegime[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Un produit naît en brouillon ; la publication se fait depuis la liste. */
  protected readonly status = signal<ProductStatus>('draft');
  protected readonly name = signal('');
  protected readonly kind = signal<string>('daily');
  protected readonly categoryId = signal('');
  protected readonly sku = signal('');
  protected readonly channelsOverride = signal<SalesChannels | null>(null);
  protected readonly scope = signal<AllergenScope>('eu');
  protected readonly entries = signal<AllergenEntry[]>([]);
  protected readonly provisional = signal(false);
  protected readonly selected = signal<string[]>([]);
  protected readonly declaresNone = signal(false);
  protected readonly nutrition = signal<Record<string, number | undefined>>({});
  protected readonly editorial = signal<Record<string, string>>({});
  protected readonly media = signal<
    { role: string; url: string; alt?: string }[]
  >([]);

  // Onglets PIM / Shopify — l'onglet Shopify n'apparaît que si l'intégration
  // est activée dans les Réglages. Lecture **réactive** du store : basculer le
  // réglage met la barre d'onglets à jour en direct.
  protected readonly shopifyEnabled = computed(
    () => this.db.snapshot().shopify.isEnabled,
  );
  protected readonly activeTab = signal<string>('identite');
  protected readonly priceEur = signal<number | null>(null);
  protected readonly weightGrams = signal<number | null>(null);
  protected readonly handle = signal('');

  /** Un onglet par section (nav horizontale, fond transparent). */
  protected readonly tabs = computed<FoldTabItem[]>(() => {
    const tabs: FoldTabItem[] = [
      { key: 'identite', label: 'Identité', icon: 'grid' },
      { key: 'canaux', label: 'Canaux & TVA', icon: 'sliders' },
      { key: 'allergenes', label: 'Allergènes', icon: 'shield' },
      { key: 'nutrition', label: 'Nutrition', icon: 'stats' },
      { key: 'communication', label: 'Communication', icon: 'edit' },
      { key: 'visuels', label: 'Visuels', icon: 'eye' },
    ];
    if (this.shopifyEnabled()) {
      tabs.push({ key: 'shopify', label: 'Shopify', icon: 'shopify' });
    }
    return tabs;
  });

  /** Aperçu des tags Shopify dérivés : régime TVA du canal + click & collect. */
  protected readonly derivedTags = computed<string[]>(() => {
    const category = this.selectedCategory();
    if (category === undefined) {
      return [];
    }
    const emporter = this.regimeById().get(category.emporterTvaId);
    const tags = [category.slug.fr, 'click-collect'];
    if (emporter !== undefined) {
      tags.push(emporter.tag);
    }
    return tags;
  });

  /** Handle proposé : l'override s'il existe, sinon dérivé du nom. */
  protected readonly effectiveHandle = computed<string>(() => {
    const override = this.handle().trim();
    if (override !== '') {
      return slugify(override);
    }
    return this.name().trim() === '' ? '' : slugify(this.name());
  });

  private readonly regimeById = computed(
    () => new Map(this.regimes().map((r) => [r.id, r])),
  );

  protected readonly selectedCategory = computed<Category | undefined>(() =>
    this.categories().find((c) => c.id === this.categoryId()),
  );

  /** Canaux effectifs : l'override s'il existe, sinon le défaut de la catégorie. */
  protected readonly effectiveChannels = computed<SalesChannels>(
    () =>
      this.channelsOverride() ??
      this.selectedCategory()?.channelPreset ??
      NO_CHANNELS,
  );

  /** Référence proposée quand le champ est vide — la racine signifiante
   *  (`VIEN-CROISS-BEURR`), déjà en majuscules. La collision éventuelle ajoute
   *  un suffixe numérique à la création ; l'aperçu montre la racine. */
  protected readonly autoSku = computed(() => {
    const category = this.selectedCategory();
    const root =
      category === undefined
        ? ''
        : productSkuRoot(category.slug.fr, this.name());
    return root === '' ? 'REF' : root;
  });

  /** Régimes de TVA de la catégorie, par **nom** (+ taux) — la règle héritée
   *  affichée en clair : « Réduit · 5,5 % ». */
  protected readonly categoryRegimes = computed(() => {
    const category = this.selectedCategory();
    if (category === undefined) {
      return null;
    }
    const regimeOf = (id: string): { name: string; rate: string } => {
      const regime = this.regimeById().get(id);
      return regime === undefined
        ? { name: '—', rate: '—' }
        : { name: regime.name, rate: formatPercent(regime.percent) };
    };
    return {
      emporter: regimeOf(category.emporterTvaId),
      surPlace: regimeOf(category.surPlaceTvaId),
    };
  });

  /** Aperçu live : les fiches que le produit générera au push. */
  protected readonly previewFiches = computed<GeneratedFiche[]>(() => {
    const category = this.selectedCategory();
    if (category === undefined) {
      return [];
    }
    const kindValue = this.kind();
    const draft: Product = {
      id: 'preview',
      sku: this.sku().trim() === '' ? '(réf. proposée)' : this.sku(),
      name: { fr: this.name().trim() === '' ? 'Nouveau produit' : this.name() },
      kind: this.isKind(kindValue) ? kindValue : 'daily',
      categoryId: category.id,
      status: 'draft',
      channelsOverride: this.channelsOverride(),
      variants: [],
    };
    return generateFiches(draft, category, this.regimeById());
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
    void this.loadReference('eu');
  }

  protected channelsInherited(): boolean {
    return this.channelsOverride() === null;
  }

  protected setChannels(channels: SalesChannels): void {
    this.channelsOverride.set(channels);
  }

  protected revertChannels(): void {
    this.channelsOverride.set(null);
  }

  protected declaresSomething(): boolean {
    return this.declaresNone() || this.selected().length > 0;
  }

  protected kindLabel(kind: ProductKind): string {
    return KIND_LABELS[kind];
  }

  protected statusLabel(): string {
    return STATUS_LABELS[this.status()];
  }

  protected editorialValue(key: string): string {
    return this.editorial()[key] ?? '';
  }

  protected nutritionValue(key: string): number | null {
    return this.nutrition()[key] ?? null;
  }

  protected setEditorial(key: string, value: string): void {
    this.editorial.update((current) => ({ ...current, [key]: value }));
  }

  protected setNutrition(key: string, value: number | null): void {
    this.nutrition.update((current) => ({
      ...current,
      [key]: value !== null && Number.isFinite(value) ? value : undefined,
    }));
  }

  protected text(event: Event): string {
    return event.target instanceof HTMLTextAreaElement ? event.target.value : '';
  }

  protected async changeScope(scope: AllergenScope): Promise<void> {
    this.scope.set(scope);
    await this.loadReference(scope);
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

  protected setMedia(index: number, key: 'role' | 'url' | 'alt', value: string): void {
    this.media.update((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, [key]: value } : slot,
      ),
    );
  }

  protected isValid(): boolean {
    return this.name().trim() !== '' && this.categoryId() !== '';
  }

  protected cancel(): void {
    void this.router.navigate(['/produits']);
  }

  protected async submit(): Promise<void> {
    const kind = this.kind();
    if (!this.isValid() || !this.isKind(kind)) {
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const declares = this.declaresNone() || this.selected().length > 0;
      const sku = this.sku().trim();
      const price = this.priceEur();
      const weight = this.weightGrams();
      const handle = this.handle().trim();
      const description = this.editorialValue('descriptionShort').trim();
      await this.api.createProduct({
        nameFr: this.name().trim(),
        kind,
        categoryId: this.categoryId(),
        ...(sku === '' ? {} : { sku }),
        ...(declares ? { allergens: this.selected() } : {}),
        ...(this.channelsOverride() === null
          ? {}
          : { channelsOverride: this.channelsOverride() }),
        ...(price === null ? {} : { priceEur: price }),
        ...(weight === null ? {} : { weightGrams: weight }),
        ...(handle === '' ? {} : { handleFr: slugify(handle) }),
        ...(description === '' ? {} : { descriptionFr: description }),
      });
      await this.router.navigate(['/produits']);
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Erreur inattendue.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  private isKind(value: string): value is ProductKind {
    return value === 'daily' || value === 'made_to_order' || value === 'resale';
  }

  private async load(): Promise<void> {
    const [categories, regimes] = await Promise.all([
      this.api.listCategories(),
      this.api.listTvaRegimes(),
    ]);
    const active = categories.filter((c) => !c.isArchived);
    this.categories.set(active);
    this.regimes.set(regimes);
    const first = active[0];
    if (this.categoryId() === '' && first !== undefined) {
      this.categoryId.set(first.id);
    }
  }

  private async loadReference(scope: AllergenScope): Promise<void> {
    const reference = await this.reference.allergens(scope);
    this.entries.set(reference.entries);
    this.provisional.set(reference.hasProvisionalCodes);
    const visible = new Set(reference.entries.map((entry) => entry.code));
    this.selected.update((current) => current.filter((c) => visible.has(c)));
  }
}

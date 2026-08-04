import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNavLayoutComponent,
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
import { ChannelsPanel } from './panels/channels-panel';
import { CommunicationPanel } from './panels/communication-panel';
import { IdentityPanel, type KindOption } from './panels/identity-panel';
import { PricingPanel } from './panels/pricing-panel';
import {
  RegulatoryPanel,
  type AllergenGroup,
} from './panels/regulatory-panel';
import { VisualsPanel, type MediaSlot } from './panels/visuals-panel';

type SectionStatus = 'saving' | 'saved' | 'error';

const KINDS: readonly KindOption[] = [
  { value: 'daily', label: 'Frais du jour' },
  { value: 'made_to_order', label: 'Sur commande' },
  { value: 'resale', label: 'Revente' },
];

const EMPTY_NUTRITION: NutritionValues = {
  energyKcal: null,
  carbsG: null,
  fatG: null,
  proteinG: null,
  glycemicIndex: null,
};

const EMPTY_EDITORIAL: EditorialFields = {
  descriptionShort: '',
  descriptionLong: '',
  story: '',
  pairing: '',
  brand: '',
  seoTitle: '',
  seoDescription: '',
};

/**
 * Formulaire produit **unique**, orchestrateur. Paramétré par mode (présence
 * d'un `:id`) : create (vierge, submit global) vs edit (hydraté, un save par
 * section). Chaque panneau est un sous-composant présentationnel ; cette page
 * détient l'état, les appels réseau et le chargement.
 */
@Component({
  selector: 'app-product-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldLoadingStateComponent,
    FoldEmptyStateComponent,
    FoldNavLayoutComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    IdentityPanel,
    PricingPanel,
    ChannelsPanel,
    RegulatoryPanel,
    CommunicationPanel,
    VisualsPanel,
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
  private readonly entries = signal<AllergenEntry[]>([]);
  protected readonly provisional = signal(false);

  // Champs — liés aux panneaux via des `model()` bidirectionnels.
  protected readonly name = signal('');
  protected readonly kind = signal<ProductKind>('daily');
  protected readonly categoryId = signal('');
  protected readonly sku = signal('');
  protected readonly priceEur = signal<number | null>(null);
  protected readonly weightGrams = signal<number | null>(null);
  protected readonly scope = signal<AllergenScope>('eu');
  protected readonly selected = signal<string[]>([]);
  protected readonly declaresNone = signal(false);
  protected readonly nutrition = signal<NutritionValues>(EMPTY_NUTRITION);
  protected readonly editorial = signal<EditorialFields>(EMPTY_EDITORIAL);
  protected readonly media = signal<MediaSlot[]>([]);

  private readonly status = signal<Record<string, SectionStatus | undefined>>(
    {},
  );

  protected readonly pageTitle = computed(() => {
    if (!this.isEdit()) {
      return 'Nouveau produit';
    }
    const name = this.name().trim();
    return name === '' ? 'Éditer le produit' : `Éditer le produit — ${name}`;
  });

  private readonly regimeById = computed(
    () => new Map(this.regimes().map((r) => [r.id, r])),
  );

  protected readonly selectedCategory = computed<Category | undefined>(() =>
    this.categories().find((c) => c.id === this.categoryId()),
  );

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

  protected async changeScope(scope: AllergenScope): Promise<void> {
    this.scope.set(scope);
    await this.loadReference(scope);
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
      const declares = this.declaresNone() || this.selected().length > 0;
      const created = await this.api.createProduct({
        nameFr: this.name().trim(),
        kind: this.kind(),
        categoryId: this.categoryId(),
        ...(sku === '' ? {} : { sku }),
        ...(declares ? { allergens: this.selected() } : {}),
        ...(price === null ? {} : { priceEur: price }),
        ...(weight === null ? {} : { weightGrams: weight }),
        ...(description === '' ? {} : { descriptionFr: description }),
      });
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

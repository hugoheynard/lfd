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
  FoldPageSectionComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import type {
  AllergenEntry,
  AllergenScope,
  Category,
  Product,
  ProductKind,
} from '../../data/models';
import { CatalogueApi } from '../catalogue-api';
import { ReferenceApi } from '../reference-api';
import {
  ProductHttpApi,
  type EditorialFields,
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
 * Éditer un produit — **calquée sur la page de création** : mêmes sections
 * (Identité, Tarif, Allergènes, Communication, Visuels), en onglets. Différence :
 * on **charge** l'existant et chaque section a son **propre bouton d'enregistrement**
 * (une requête par section). Canaux/Nutrition arriveront avec leurs contextes.
 */
@Component({
  selector: 'app-product-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
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
  templateUrl: './product-edit-page.html',
  styleUrl: './product-edit-page.scss',
})
export class ProductEditPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly products = inject(ProductHttpApi);
  private readonly api = inject(CatalogueApi);
  private readonly reference = inject(ReferenceApi);

  protected readonly kinds = KINDS;
  protected readonly scopes = [
    { value: 'eu' as const, label: 'UE / France' },
    { value: 'world' as const, label: 'Monde' },
  ];
  protected readonly editorialFields = [
    { key: 'descriptionShort' as const, label: 'Résumé court' },
    { key: 'brand' as const, label: 'Marque / gamme' },
    { key: 'seoTitle' as const, label: 'Titre SEO' },
    { key: 'seoDescription' as const, label: 'Description SEO' },
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
    { key: 'allergenes', label: 'Allergènes', icon: 'shield' },
    { key: 'communication', label: 'Communication', icon: 'edit' },
    { key: 'visuels', label: 'Visuels', icon: 'eye' },
  ];
  protected readonly activeTab = signal<string>('identite');

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly categories = signal<Category[]>([]);

  private readonly productId = signal('');
  private readonly variantId = signal('');
  protected readonly sku = signal('');

  // Identité
  protected readonly name = signal('');
  protected readonly kind = signal<ProductKind>('daily');
  protected readonly categoryId = signal('');
  // Tarif
  protected readonly priceEur = signal<number | null>(null);
  protected readonly weightGrams = signal<number | null>(null);
  // Allergènes
  protected readonly scope = signal<AllergenScope>('eu');
  protected readonly entries = signal<AllergenEntry[]>([]);
  protected readonly provisional = signal(false);
  protected readonly selected = signal<string[]>([]);
  protected readonly declaresNone = signal(false);
  // Communication
  protected readonly editorial = signal<EditorialFields>(EMPTY_EDITORIAL);
  // Visuels
  protected readonly media = signal<
    { role: string; url: string; alt?: string }[]
  >([]);

  private readonly status = signal<Record<string, SectionStatus | undefined>>(
    {},
  );

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

  protected declaresSomething(): boolean {
    return this.declaresNone() || this.selected().length > 0;
  }

  protected editorialValue(key: keyof EditorialFields): string {
    return this.editorial()[key];
  }

  protected setEditorial(key: keyof EditorialFields, value: string): void {
    this.editorial.update((current) => ({ ...current, [key]: value }));
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

  // ── Enregistrement par section ───────────────────────────────────────────

  protected saveIdentity(): Promise<void> {
    if (this.name().trim() === '' || this.categoryId() === '') {
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

  protected saveAllergens(): Promise<void> {
    const allergens = this.declaresNone() ? [] : this.selected();
    return this.save('allergenes', () =>
      this.products.setVariantAllergens(
        this.productId(),
        this.variantId(),
        allergens,
      ),
    );
  }

  protected saveCommunication(): Promise<void> {
    return this.save('communication', () =>
      this.products.saveEditorial(this.productId(), this.editorial()),
    );
  }

  protected back(): void {
    void this.router.navigate(['/produits']);
  }

  private isKind(value: string): value is ProductKind {
    return value === 'daily' || value === 'made_to_order' || value === 'resale';
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
      this.error.set(
        caught instanceof Error ? caught.message : 'Enregistrement impossible.',
      );
    }
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.productId.set(id);
    this.loading.set(true);
    try {
      const [detail, categories] = await Promise.all([
        this.products.getDetail(id),
        this.api.listCategories(),
      ]);
      this.categories.set(
        categories.filter((category) => !category.isArchived),
      );
      await this.loadReference('eu');
      if (detail === null) {
        this.notFound.set(true);
        return;
      }
      this.hydrate(detail.product, detail.editorial);
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Chargement impossible.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  private hydrate(product: Product, editorial: EditorialFields): void {
    this.sku.set(product.sku);
    this.name.set(product.name.fr);
    this.kind.set(product.kind);
    this.categoryId.set(product.categoryId);
    this.priceEur.set(product.priceEur ?? null);
    this.weightGrams.set(product.weightGrams ?? null);
    this.editorial.set(editorial);
    const variant =
      product.variants.find((entry) => entry.isDefault) ?? product.variants[0];
    this.variantId.set(variant?.id ?? '');
    const allergens = variant?.allergens ?? null;
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

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
  FoldListboxComponent,
  FoldOptionComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { CatalogueApi, type Category } from '../catalogue-api';
import type { Product, ProductKind } from '../../data/models';
import { ProductHttpApi } from '../product-http-api';

type SectionStatus = 'saving' | 'saved' | 'error';

const KINDS: readonly { value: ProductKind; label: string }[] = [
  { value: 'daily', label: 'Frais du jour' },
  { value: 'made_to_order', label: 'Sur commande' },
  { value: 'resale', label: 'Revente' },
];

/**
 * Éditer un produit — une **vraie page** (comme la création), plus la div
 * inline d'antan. Chaque section s'**enregistre indépendamment** contre son
 * endpoint backend (auto-save au blur / au changement), avec son propre
 * indicateur « enregistré ». Le prix et le poids portent sur la déclinaison par
 * défaut ; canaux/conditionnements arriveront avec le contexte commerce.
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
    FoldListboxComponent,
    FoldOptionComponent,
  ],
  templateUrl: './product-edit-page.html',
  styleUrl: './product-edit-page.scss',
})
export class ProductEditPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly products = inject(ProductHttpApi);
  private readonly api = inject(CatalogueApi);

  protected readonly kinds = KINDS;

  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly categories = signal<Category[]>([]);

  private readonly productId = signal('');
  private readonly variantId = signal('');
  protected readonly sku = signal('');

  // Champs éditables — initialisés depuis le produit chargé.
  protected readonly name = signal('');
  protected readonly kind = signal<ProductKind>('daily');
  protected readonly categoryId = signal('');
  protected readonly priceEur = signal<number | null>(null);
  protected readonly weightGrams = signal<number | null>(null);
  protected readonly descriptionFr = signal('');

  /** État d'enregistrement par section (clé = section). */
  private readonly status = signal<Record<string, SectionStatus | undefined>>(
    {},
  );

  protected readonly kindLabel = computed(() => {
    const current = this.kind();
    return KINDS.find((entry) => entry.value === current)?.label ?? current;
  });

  constructor() {
    void this.load();
  }

  protected statusOf(section: string): SectionStatus | undefined {
    return this.status()[section];
  }

  protected statusText(section: string): string {
    switch (this.statusOf(section)) {
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

  protected inputValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  // ── Édition des champs (mise à jour locale, sans requête) ────────────────

  protected setName(value: string): void {
    this.name.set(value);
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

  protected setPrice(value: number | null): void {
    this.priceEur.set(value);
  }

  protected setWeight(value: number | null): void {
    this.weightGrams.set(value);
  }

  protected setDescription(value: string): void {
    this.descriptionFr.set(value);
  }

  // ── Enregistrement PAR SECTION (une requête par section, pas par champ) ──

  protected saveIdentity(): Promise<void> {
    if (this.name().trim() === '' || this.categoryId() === '') {
      return Promise.resolve();
    }
    return this.save('identity', () =>
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
    return this.save('pricing', () =>
      this.products.savePricing(this.productId(), this.variantId(), {
        priceCents: price === null ? null : Math.round(price * 100),
        weightGrams: weight === null ? null : Math.round(weight),
      }),
    );
  }

  protected saveDescription(): Promise<void> {
    return this.save('description', () =>
      this.products.saveDescription(this.productId(), this.descriptionFr().trim()),
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
    this.setStatus(section, 'saving');
    this.error.set(null);
    try {
      await action();
      this.setStatus(section, 'saved');
    } catch (caught) {
      this.setStatus(section, 'error');
      this.error.set(
        caught instanceof Error ? caught.message : 'Enregistrement impossible.',
      );
    }
  }

  private setStatus(section: string, value: SectionStatus): void {
    this.status.update((current) => ({ ...current, [section]: value }));
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.productId.set(id);
    this.loading.set(true);
    try {
      const [product, categories] = await Promise.all([
        this.api.getProduct(id),
        this.api.listCategories(),
      ]);
      this.categories.set(categories.filter((category) => !category.isArchived));
      if (product === null) {
        this.notFound.set(true);
        return;
      }
      this.hydrate(product);
    } catch (caught) {
      this.error.set(
        caught instanceof Error ? caught.message : 'Chargement impossible.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  private hydrate(product: Product): void {
    this.sku.set(product.sku);
    this.name.set(product.name.fr);
    this.kind.set(product.kind);
    this.categoryId.set(product.categoryId);
    this.priceEur.set(product.priceEur ?? null);
    this.weightGrams.set(product.weightGrams ?? null);
    this.descriptionFr.set(product.descriptionFr ?? '');
    const variant =
      product.variants.find((entry) => entry.isDefault) ?? product.variants[0];
    this.variantId.set(variant?.id ?? '');
  }
}

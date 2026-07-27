import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  FoldOptionComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import type { Category, ProductKind } from '../catalogue-api';
import {
  ReferenceApi,
  type AllergenEntry,
  type AllergenScope,
} from '../reference-api';

export interface MediaSlot {
  role: string;
  url: string;
  alt?: string;
}

export interface NewProductForm {
  nameFr: string;
  kind: ProductKind;
  categoryId: string;
  sku?: string;
  allergens?: string[];
  mayContain?: string[];
  nutrition?: {
    energyKcal?: number;
    carbsG?: number;
    fatG?: number;
    proteinG?: number;
    glycemicIndex?: number;
  };
  editorial?: Record<string, string>;
  media?: MediaSlot[];
}

interface AllergenGroup {
  readonly incoLabel: string;
  readonly entries: readonly AllergenEntry[];
}

const KIND_LABELS: Record<ProductKind, string> = {
  daily: 'Frais du jour',
  made_to_order: 'Sur commande',
  resale: 'Revente',
};

/**
 * Fiche de création complète, composée de primitives fold.
 *
 * Les allergènes sont groupés par **catégorie réglementaire** (mapping n:1 rendu
 * visible) — blé, seigle, orge retombent tous sur « Céréales contenant du
 * gluten ». Les `<fieldset>`/`<legend>`/`<textarea>` restent natifs : fold n'a
 * pas d'équivalent (regroupement sémantique, saisie multiligne).
 */
@Component({
  selector: 'app-product-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldTabsComponent,
    FoldTabPanelComponent,
    FoldInputComponent,
    FoldNumberInputComponent,
    FoldListboxComponent,
    FoldOptionComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
  ],
  templateUrl: './product-form.html',
  styleUrl: './product-form.scss',
})
export class ProductForm {
  readonly categories = input.required<readonly Category[]>();
  readonly created = output<NewProductForm>();
  readonly cancelled = output<void>();

  private readonly reference = inject(ReferenceApi);

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

  protected readonly nameFr = signal('');
  protected readonly kind = signal<string>('daily');
  protected readonly categoryId = signal('');
  protected readonly sku = signal('');
  protected readonly scope = signal<AllergenScope>('eu');
  protected readonly entries = signal<AllergenEntry[]>([]);
  protected readonly provisional = signal(false);
  protected readonly selected = signal<string[]>([]);
  protected readonly declaresNone = signal(false);
  protected readonly nutrition = signal<Record<string, number | undefined>>({});
  protected readonly editorial = signal<Record<string, string>>({});
  protected readonly media = signal<MediaSlot[]>([]);
  protected readonly active = signal<string>('identity');

  /** Onglets fold : la pastille signale une fiche allergènes non renseignée. */
  protected readonly tabs = computed<FoldTabItem[]>(() => [
    { key: 'identity', label: 'Identité' },
    {
      key: 'nutrition',
      label: 'Nutrition & allergènes',
      badge: this.declaresSomething() ? null : '!',
    },
    { key: 'communication', label: 'Communication' },
  ]);

  /** Groupé par catégorie réglementaire : c'est le mapping n:1 rendu lisible. */
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
    void this.loadReference('eu');

    // La famille par défaut suit la liste reçue, sans écraser un choix déjà fait.
    effect(() => {
      const first = this.categories()[0];
      if (this.categoryId() === '' && first !== undefined) {
        this.categoryId.set(first.id);
      }
    });
  }

  /** Alimente la pastille de l'onglet : une fiche non renseignée doit se voir. */
  protected declaresSomething(): boolean {
    return this.declaresNone() || this.selected().length > 0;
  }

  protected setEditorial(key: string, value: string): void {
    this.editorial.update((current) => ({ ...current, [key]: value }));
  }

  protected editorialValue(key: string): string {
    return this.editorial()[key] ?? '';
  }

  protected nutritionValue(key: string): number | null {
    return this.nutrition()[key] ?? null;
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

  protected setMedia(index: number, key: keyof MediaSlot, value: string): void {
    this.media.update((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, [key]: value } : slot,
      ),
    );
  }

  protected isValid(): boolean {
    return this.nameFr().trim() !== '' && this.categoryId() !== '';
  }

  protected kindLabel(kind: ProductKind): string {
    return KIND_LABELS[kind];
  }

  /** Valeur d'un `<textarea>` natif (fold n'a pas de multiligne). */
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

  /** « Aucun allergène » et une sélection sont mutuellement exclusifs. */
  protected toggleNone(on: boolean): void {
    this.declaresNone.set(on);
    if (on) {
      this.selected.set([]);
    }
  }

  protected setNutrition(key: string, value: number | null): void {
    this.nutrition.update((current) => ({
      ...current,
      [key]: value !== null && Number.isFinite(value) ? value : undefined,
    }));
  }

  protected submit(): void {
    const kind = this.kind();
    if (!this.isValid() || !this.isKind(kind)) {
      return;
    }

    const values = Object.fromEntries(
      Object.entries(this.nutrition()).filter(([, value]) => value !== undefined),
    );
    const sku = this.sku().trim();
    // Aucune sélection ET pas de déclaration « aucun » ⇒ on n'envoie PAS de fiche :
    // le produit reste « non renseigné », ce qui bloquera sa publication.
    const declares = this.declaresNone() || this.selected().length > 0;

    const story = Object.fromEntries(
      Object.entries(this.editorial()).filter(([, value]) => value.trim() !== ''),
    );
    const visuals = this.media().filter((slot) => slot.url.trim() !== '');

    this.created.emit({
      nameFr: this.nameFr().trim(),
      kind,
      categoryId: this.categoryId(),
      ...(sku === '' ? {} : { sku }),
      ...(declares ? { allergens: this.selected() } : {}),
      ...(Object.keys(values).length > 0 ? { nutrition: values } : {}),
      ...(Object.keys(story).length > 0 ? { editorial: story } : {}),
      ...(visuals.length > 0 ? { media: visuals } : {}),
    });
  }

  private isKind(value: string): value is ProductKind {
    return value === 'daily' || value === 'made_to_order' || value === 'resale';
  }

  private async loadReference(scope: AllergenScope): Promise<void> {
    const reference = await this.reference.allergens(scope);
    this.entries.set(reference.entries);
    this.provisional.set(reference.hasProvisionalCodes);
    // Passer de Monde à UE ne doit pas garder un code devenu invisible.
    const visible = new Set(reference.entries.map((entry) => entry.code));
    this.selected.update((current) => current.filter((code) => visible.has(code)));
  }
}

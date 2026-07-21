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

import type { Category, ProductKind } from './catalogue-api';
import {
  ReferenceApi,
  type AllergenEntry,
  type AllergenScope,
} from './reference-api';

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
 * Fiche de création complète.
 *
 * Les allergènes sont groupés par **catégorie réglementaire** et non listés à plat :
 * blé, seigle, orge et avoine retombent tous sur « Céréales contenant du gluten ».
 * C'est le mapping n:1 rendu visible — sinon on croit cocher quatre choses
 * différentes alors que l'étiquette n'en affichera qu'une.
 */
@Component({
  selector: 'app-product-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="form" (submit)="submit($event)">
      <section class="block">
        <h2>Identité</h2>
        <div class="grid">
          <label>
            <span>Nom du produit</span>
            <input
              type="text"
              placeholder="Tarte aux fraises"
              [value]="nameFr()"
              (input)="nameFr.set(text($event))"
              required
            />
          </label>
          <label>
            <span>Famille</span>
            <select [value]="categoryId()" (change)="categoryId.set(text($event))">
              @for (category of categories(); track category.id) {
                <option [value]="category.id">{{ category.name.fr }}</option>
              }
            </select>
          </label>
          <label>
            <span>Nature</span>
            <select [value]="kind()" (change)="kind.set(text($event))">
              @for (option of kinds; track option) {
                <option [value]="option">{{ kindLabel(option) }}</option>
              }
            </select>
          </label>
          <label>
            <span>Référence</span>
            <input
              type="text"
              class="sku"
              placeholder="proposée si vide"
              [value]="sku()"
              (input)="sku.set(text($event))"
            />
            <small>Laissée vide, elle est calculée depuis la famille et le nom.</small>
          </label>
        </div>
      </section>

      <section class="block">
        <div class="block-head">
          <h2>Allergènes <span class="required">obligatoire</span></h2>
          <div class="scope">
            @for (option of scopes; track option.value) {
              <button
                type="button"
                class="chip"
                [class.on]="scope() === option.value"
                (click)="changeScope(option.value)"
              >
                {{ option.label }}
              </button>
            }
          </div>
        </div>

        @if (provisional()) {
          <p class="warn">
            ⚠️ Les <strong>codes</strong> de ce référentiel sont provisoires — les
            catégories réglementaires, elles, sont exactes. À reprendre depuis GS1
            avant tout export réel.
          </p>
        }

        <p class="hint">
          Rien à déclarer ? Cochez <em>Aucun allergène</em> : c'est une affirmation,
          différente d'un champ laissé vide.
        </p>

        <label class="none">
          <input
            type="checkbox"
            [checked]="declaresNone()"
            (change)="toggleNone(checked($event))"
          />
          <span>Aucun allergène</span>
        </label>

        <div class="groups" [class.disabled]="declaresNone()">
          @for (group of groups(); track group.incoLabel) {
            <fieldset>
              <legend>{{ group.incoLabel }}</legend>
              @for (item of group.entries; track item.code) {
                <label class="entry">
                  <input
                    type="checkbox"
                    [checked]="selected().includes(item.code)"
                    [disabled]="declaresNone()"
                    (change)="toggle(item.code, checked($event))"
                  />
                  <span class="name">{{ item.label }}</span>
                  <code>{{ item.code }}</code>
                </label>
              }
            </fieldset>
          }
        </div>
      </section>

      <section class="block">
        <h2>Valeurs nutritionnelles <span class="optional">pour 100 g · optionnel</span></h2>
        <div class="grid">
          @for (field of nutritionFields; track field.key) {
            <label>
              <span>{{ field.label }}</span>
              <input
                type="number"
                min="0"
                step="0.1"
                [value]="nutrition()[field.key] ?? ''"
                (input)="setNutrition(field.key, text($event))"
              />
            </label>
          }
        </div>
      </section>

      <div class="actions">
        <button type="submit" [disabled]="!isValid()">Créer le produit</button>
        <button type="button" class="ghost" (click)="cancelled.emit()">Annuler</button>
        @if (!isValid()) {
          <small>Un nom et une famille sont nécessaires.</small>
        }
      </div>
    </form>
  `,
  styleUrl: './catalogue.scss',
  styles: [
    `
      .form {
        display: grid;
        gap: 1.25rem;
        padding: 1.25rem;
        margin-bottom: 1.5rem;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 0.6rem;
      }
      .block {
        display: grid;
        gap: 0.75rem;
      }
      .block + .block {
        padding-top: 1.1rem;
        border-top: 1px solid var(--line);
      }
      h2 {
        margin: 0;
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--muted);
      }
      .required,
      .optional {
        margin-left: 0.4rem;
        font-weight: 400;
        text-transform: none;
        letter-spacing: 0;
      }
      .required {
        color: var(--danger);
      }
      .block-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
        gap: 0.75rem;
      }
      label {
        display: grid;
        gap: 0.25rem;
        font-size: 0.9rem;
      }
      small {
        color: var(--muted);
        font-size: 0.78rem;
      }
      .chip {
        padding: 0.25rem 0.7rem;
        font-size: 0.8rem;
        color: var(--muted);
        background: transparent;
        border: 1px solid var(--line);
        border-radius: 999px;
      }
      .chip.on {
        color: var(--on-accent);
        background: var(--accent);
        border-color: var(--accent);
      }
      .warn {
        margin: 0;
        padding: 0.55rem 0.75rem;
        font-size: 0.83rem;
        background: color-mix(in srgb, var(--danger) 8%, transparent);
        border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
        border-radius: 0.4rem;
      }
      .hint {
        margin: 0;
        font-size: 0.83rem;
        color: var(--muted);
      }
      .none {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 500;
      }
      .none input {
        width: auto;
      }
      .groups {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
        gap: 0.6rem;
      }
      .groups.disabled {
        opacity: 0.4;
      }
      fieldset {
        margin: 0;
        padding: 0.5rem 0.7rem 0.6rem;
        border: 1px solid var(--line);
        border-radius: 0.45rem;
      }
      legend {
        padding: 0 0.3rem;
        font-size: 0.78rem;
        font-weight: 600;
        color: var(--muted);
      }
      .entry {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.85rem;
      }
      .entry input {
        width: auto;
      }
      .entry .name {
        flex: 1;
      }
      .entry code {
        font-size: 0.72rem;
        color: var(--muted);
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 0.6rem;
      }
    `,
  ],
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

  protected isValid(): boolean {
    return this.nameFr().trim() !== '' && this.categoryId() !== '';
  }

  protected kindLabel(kind: ProductKind): string {
    return KIND_LABELS[kind];
  }

  protected text(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  protected checked(event: Event): boolean {
    const target = event.target;
    return target instanceof HTMLInputElement ? target.checked : false;
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

  protected setNutrition(key: string, raw: string): void {
    const parsed = raw.trim() === '' ? undefined : Number(raw);
    this.nutrition.update((current) => ({
      ...current,
      [key]: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
    }));
  }

  protected submit(event: Event): void {
    event.preventDefault();
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

    this.created.emit({
      nameFr: this.nameFr().trim(),
      kind,
      categoryId: this.categoryId(),
      ...(sku === '' ? {} : { sku }),
      ...(declares ? { allergens: this.selected() } : {}),
      ...(Object.keys(values).length > 0 ? { nutrition: values } : {}),
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
    this.selected.update((current) =>
      current.filter((code) => visible.has(code)),
    );
  }
}

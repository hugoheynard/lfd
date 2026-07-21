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

/** Un onglet par nature de contenu — trois rythmes de vie différents. */
type CardKey = 'identity' | 'nutrition' | 'communication';

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
      <nav class="tabs">
        @for (card of cards; track card.key) {
          <button
            type="button"
            class="tab"
            [class.on]="active() === card.key"
            (click)="active.set(card.key)"
          >
            {{ card.label }}
            @if (card.key === 'nutrition' && !declaresSomething()) {
              <span class="dot" title="Fiche réglementaire non renseignée"></span>
            }
          </button>
        }
      </nav>

      <section class="block" [hidden]="active() !== 'identity'">
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

      <section class="block" [hidden]="active() !== 'nutrition'">
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

      <section class="block" [hidden]="active() !== 'nutrition'">
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

      <section class="block" [hidden]="active() !== 'communication'">
        <h2>Texte <span class="optional">optionnel</span></h2>
        <div class="grid">
          <label>
            <span>Résumé court</span>
            <input
              type="text"
              placeholder="Affiché en caisse et sur les listes"
              [value]="editorial()['descriptionShort'] ?? ''"
              (input)="setEditorial('descriptionShort', text($event))"
            />
          </label>
          <label>
            <span>Marque / gamme</span>
            <input
              type="text"
              placeholder="Signature Chevallot"
              [value]="editorial()['brand'] ?? ''"
              (input)="setEditorial('brand', text($event))"
            />
          </label>
        </div>
        <label>
          <span>Description longue</span>
          <textarea
            rows="4"
            placeholder="La fiche complète du site — markdown accepté."
            [value]="editorial()['descriptionLong'] ?? ''"
            (input)="setEditorial('descriptionLong', text($event))"
          ></textarea>
        </label>
        <label>
          <span>Récit / savoir-faire</span>
          <textarea
            rows="3"
            placeholder="Façonnée à la main chaque matin…"
            [value]="editorial()['story'] ?? ''"
            (input)="setEditorial('story', text($event))"
          ></textarea>
        </label>
        <label>
          <span>Accord / conseil de dégustation</span>
          <input
            type="text"
            [value]="editorial()['pairing'] ?? ''"
            (input)="setEditorial('pairing', text($event))"
          />
        </label>

        <h2>Référencement <span class="optional">optionnel</span></h2>
        <div class="grid">
          <label>
            <span>Titre SEO</span>
            <input
              type="text"
              [value]="editorial()['seoTitle'] ?? ''"
              (input)="setEditorial('seoTitle', text($event))"
            />
          </label>
          <label>
            <span>Description SEO</span>
            <input
              type="text"
              [value]="editorial()['seoDescription'] ?? ''"
              (input)="setEditorial('seoDescription', text($event))"
            />
          </label>
        </div>

        <h2>Visuels</h2>
        <p class="hint">
          On stocke le <strong>master</strong> ; chaque canal en dérive ses tailles.
          L'envoi de fichiers n'est pas encore branché — on renseigne une adresse.
        </p>
        <div class="media">
          @for (slot of media(); track $index) {
            <div class="media-row">
              <select
                [value]="slot.role"
                (change)="setMedia($index, 'role', text($event))"
              >
                @for (role of mediaRoles; track role.value) {
                  <option [value]="role.value">{{ role.label }}</option>
                }
              </select>
              <input
                type="url"
                placeholder="https://…"
                [value]="slot.url"
                (input)="setMedia($index, 'url', text($event))"
              />
              <input
                type="text"
                placeholder="Texte alternatif (accessibilité + SEO)"
                [value]="slot.alt ?? ''"
                (input)="setMedia($index, 'alt', text($event))"
              />
              <button type="button" class="ghost" (click)="removeMedia($index)">
                Retirer
              </button>
            </div>
          }
        </div>
        <button type="button" class="ghost add" (click)="addMedia()">
          Ajouter un visuel
        </button>
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
      .tabs {
        display: flex;
        gap: 0.25rem;
        border-bottom: 1px solid var(--line);
      }
      .tab {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.45rem 0.9rem;
        font-size: 0.88rem;
        color: var(--muted);
        background: transparent;
        border: 0;
        border-bottom: 2px solid transparent;
        border-radius: 0;
      }
      .tab.on {
        color: var(--text);
        border-bottom-color: var(--accent);
      }
      .dot {
        width: 0.45rem;
        height: 0.45rem;
        border-radius: 50%;
        background: var(--danger);
      }
      .block[hidden] {
        display: none;
      }
      textarea {
        padding: 0.5rem 0.6rem;
        font: inherit;
        color: inherit;
        background: var(--field);
        border: 1px solid var(--line);
        border-radius: 0.4rem;
        resize: vertical;
      }
      .media {
        display: grid;
        gap: 0.4rem;
      }
      .media-row {
        display: grid;
        grid-template-columns: 9rem minmax(10rem, 1.2fr) minmax(10rem, 1fr) auto;
        gap: 0.4rem;
      }
      .add {
        justify-self: start;
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
  protected readonly editorial = signal<Record<string, string>>({});
  protected readonly media = signal<MediaSlot[]>([]);
  protected readonly active = signal<CardKey>('identity');

  protected readonly cards: readonly { key: CardKey; label: string }[] = [
    { key: 'identity', label: 'Identité' },
    { key: 'nutrition', label: 'Nutrition & allergènes' },
    { key: 'communication', label: 'Communication' },
  ];

  protected readonly mediaRoles = [
    { value: 'hero', label: 'Principale' },
    { value: 'gallery', label: 'Galerie' },
    { value: 'lifestyle', label: 'Ambiance' },
    { value: 'thumbnail', label: 'Miniature' },
    { value: 'print', label: 'Impression' },
  ];

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

  protected text(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
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

    const story = Object.fromEntries(
      Object.entries(this.editorial()).filter(
        ([, value]) => value.trim() !== '',
      ),
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
    this.selected.update((current) =>
      current.filter((code) => visible.has(code)),
    );
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import type {
  StaffSuggestionChoicesView,
  StaffSuggestionOrder,
  StaffSuggestionPlacement,
  StaffSuggestionPreviewView,
  StaffSuggestionReader,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldInputComponent,
  FoldListboxComponent,
  type FoldSelectOption,
  FoldTimeComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { CatalogProduct } from '../../contenu/storefront-catalog';
import { StorefrontProductPicker } from '../../contenu/storefront-product-picker/storefront-product-picker';
import { parisToday } from '../../shared/paris-today';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import { refusalOf } from '../suggestion-format';
import {
  defaultCardTitle,
  previewPayload,
  previewPrice,
  previewReason,
  type PreviewSetup,
  type ReasonContext,
} from '../suggestion-preview';

const PLACEMENT_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'cart', label: 'Au panier' },
  { value: 'product', label: 'Sur une fiche' },
  { value: 'home', label: 'À l’accueil' },
];

const AUDIENCE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: 'public', label: 'Particuliers' },
  { value: 'pro', label: 'Professionnels' },
];

/**
 * **L'aperçu** (RS5, `suggestions-du-staff.md` §7) : un emplacement — panier,
 * fiche ou accueil (RS7) —,
 * une clientèle, un jour → la carte que verrait le client, puis chaque règle
 * avec « affichée » ou la raison pour laquelle elle ne l'est pas.
 *
 * Tout vient du serveur, qui déroule la chaîne de la boutique : l'écran ne
 * juge rien. Aux professionnels, la carte montre la vitrine pro sans tarif de
 * société — un aperçu n'a pas de client, et l'écran le dit.
 */
@Component({
  selector: 'app-suggestion-preview-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldTimeComponent,
    FoldViewToggleComponent,
    StorefrontProductPicker,
  ],
  templateUrl: './suggestion-preview-card.html',
  styleUrl: './suggestion-preview-card.scss',
})
export class SuggestionPreviewCard {
  private readonly api = inject(StaffSuggestionsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly rules = input.required<readonly StaffSuggestionRuleView[]>();
  readonly choices = input.required<StaffSuggestionChoicesView | null>();

  protected readonly placementOptions = PLACEMENT_OPTIONS;
  protected readonly audienceOptions = AUDIENCE_OPTIONS;

  protected readonly placement = signal<StaffSuggestionPlacement>('cart');
  protected readonly audience = signal<StaffSuggestionReader>('public');
  protected readonly day = signal(parisToday());
  protected readonly cart = signal<readonly string[]>([]);
  protected readonly viewedSku = signal<string | null>(null);
  /** RS8 : l'heure jugée (vide = maintenant), le total lu (vide = pas chiffré), le point choisi. */
  protected readonly time = signal('');
  protected readonly cartTotal = signal('');
  protected readonly siteId = signal<string | null>(null);
  protected readonly siteOptions = computed<readonly FoldSelectOption<string>[]>(() => [
    { value: '', label: 'Pas encore choisi' },
    ...(this.choices()?.sites ?? []).map((site) => ({ value: site.id, label: site.label })),
  ]);

  protected readonly result = signal<StaffSuggestionPreviewView | null>(null);
  private readonly order = signal<StaffSuggestionOrder | null>(null);
  /** La clientèle de l'aperçu affiché — le prix s'écrit pour elle, pas pour le choix en cours. */
  private readonly shownFor = signal<StaffSuggestionReader>('public');
  protected readonly busy = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly products = computed<readonly CatalogProduct[]>(() =>
    (this.choices()?.articles ?? []).map((article) => ({
      sku: article.sku,
      name: article.name,
      shelf: article.familyId,
    })),
  );
  protected readonly cartItems = computed(() =>
    this.cart().map((sku) => ({ sku, name: this.nameOf(sku) })),
  );
  protected readonly canPreview = computed(
    () => this.day() !== '' && (this.placement() !== 'product' || this.viewedSku() !== null),
  );
  private readonly byId = computed(() => new Map(this.rules().map((rule) => [rule.id, rule])));
  private readonly context = computed<ReasonContext>(() => ({
    choices: this.choices(),
    rules: this.byId(),
    order: this.order(),
  }));

  /** Les lignes du diagnostic, prêtes à écrire. */
  protected readonly diagnosis = computed(() =>
    (this.result()?.rules ?? []).flatMap((row) => {
      const rule = this.byId().get(row.ruleId);
      if (rule === undefined) {
        return [];
      }
      const ctx = this.context();
      return [
        {
          id: row.ruleId,
          name:
            rule.phrase === null
              ? rule.suggestedSkus.map((sku) => this.nameOf(sku)).join(', ')
              : rule.phrase.fr,
          shown: row.status === 'shown',
          reason: previewReason(rule, row, ctx),
          items:
            rule.suggestedSkus.length > 1
              ? row.items.map((item) => ({
                  sku: item.sku,
                  name: this.nameOf(item.sku),
                  shown: item.status === 'shown',
                  reason: previewReason(rule, item, ctx, item.sku),
                }))
              : [],
        },
      ];
    }),
  );

  /** La carte telle que le client la verrait : son titre, et chaque article à son prix. */
  protected readonly card = computed(() => {
    const view = this.result();
    const first = view?.shown[0];
    if (view === null || first === undefined) {
      return null;
    }
    return {
      title: first.reason.phrase?.fr ?? defaultCardTitle(this.placement()),
      items: view.shown.map(({ sku, item }) => ({
        sku,
        name: item.name,
        price: previewPrice(item, this.shownFor()),
      })),
    };
  });

  /** Ouvert depuis une règle : l'emplacement et le déclencheur qui la rendent vraie, puis l'aperçu. */
  async openFor(setup: PreviewSetup): Promise<void> {
    this.placement.set(setup.placement);
    this.audience.set(setup.audience);
    this.day.set(setup.day);
    this.cart.set(setup.cart);
    this.viewedSku.set(setup.viewedSku);
    this.time.set(setup.time);
    this.cartTotal.set(setup.cartTotal);
    this.siteId.set(setup.siteId);
    this.host.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await this.run();
  }

  protected choosePlacement(value: string): void {
    if (value === 'cart' || value === 'product' || value === 'home') {
      this.placement.set(value);
      this.result.set(null);
    }
  }

  protected chooseAudience(value: string): void {
    if (value === 'pro' || value === 'public') {
      this.audience.set(value);
    }
  }

  protected addToCart(sku: string): void {
    if (!this.cart().includes(sku)) {
      this.cart.update((skus) => [...skus, sku]);
    }
  }

  protected removeFromCart(sku: string): void {
    this.cart.update((skus) => skus.filter((candidate) => candidate !== sku));
  }

  protected async run(): Promise<void> {
    const payload = previewPayload({
      placement: this.placement(),
      cart: this.cart(),
      viewedSku: this.viewedSku(),
      audience: this.audience(),
      day: this.day(),
      time: this.time(),
      cartTotal: this.cartTotal(),
      siteId: this.siteId(),
    });
    if (payload === null) {
      return;
    }
    this.busy.set(true);
    this.failure.set(null);
    try {
      const [view, order] = await Promise.all([
        this.api.preview(payload),
        this.api.order().then(
          (read) => read.order,
          () => null,
        ),
      ]);
      this.order.set(order);
      this.shownFor.set(payload.audience);
      this.result.set(view);
    } catch (error) {
      this.failure.set(refusalOf(error, 'L’aperçu n’a pas pu être calculé.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected nameOf(sku: string): string {
    return this.choices()?.articles.find((article) => article.sku === sku)?.name ?? sku;
  }
}

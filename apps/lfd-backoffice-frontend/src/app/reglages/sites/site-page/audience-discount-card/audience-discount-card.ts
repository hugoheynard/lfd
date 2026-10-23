import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import type {
  AudiencePickupDiscount,
  CustomerAudience,
  PickupDiscountScope,
  SiteView,
} from '@lfd/contracts';
import {
  fromCartAdjustment,
  PriceAlterationField,
  toCartAdjustment,
  type PriceAlteration,
} from '@lfd/b2b-ui/pricing';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldChoiceRowComponent,
  FoldElementTitleComponent,
  FoldFieldsetComponent,
  FoldMultiselectComponent,
  type FoldChoiceOption,
  type FoldSelectItem,
} from 'fold-ng';

import { NotifyService } from '../../../../notify.service';
import {
  AUDIENCE_TITLE,
  chosenFamilies,
  chosenProducts,
  discountOf,
  draftOf,
  strayRules,
  withFamilies,
  withoutRule,
  withProducts,
  withScope,
  type DiscountCatalogue,
  type DiscountDraft,
  type StrayRule,
} from '../../pickup-discount-rules';
import { SitesService } from '../../sites.service';
import { placePayload } from '../site-place-payload';

const SCOPES: readonly FoldChoiceOption[] = [
  { key: 'all_except', label: 'Tout, sauf…' },
  { key: 'only', label: 'Seulement…' },
];

/** Les mots des trois listes, selon le mode. */
const WORDING: Readonly<
  Record<PickupDiscountScope, { families: string; products: string; contradicting: string }>
> = {
  all_except: {
    families: 'Familles exclues',
    products: 'Produits exclus',
    contradicting: 'Produits réinclus malgré leur famille exclue',
  },
  only: {
    families: 'Familles incluses',
    products: 'Produits inclus',
    contradicting: 'Produits exclus malgré leur famille incluse',
  },
};

/** Deux remises égales en contenu : un rechargement de la page ne réinitialise pas un brouillon. */
const sameDiscount = (a: AudiencePickupDiscount | null, b: AudiencePickupDiscount | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * **La remise de retrait d'UNE clientèle sur un site** — lot B du plan
 * `plan-remise-retrait-par-clientele-et-exclusions.md` : la réduction, le mode
 * de portée, puis les familles et produits qu'il vise. Un produit peut
 * contredire sa famille (Q1), dans une liste à lui.
 *
 * Elle enregistre SA clientèle seulement : l'autre est renvoyée telle que le
 * serveur l'a, jamais le brouillon de la carte voisine.
 */
@Component({
  selector: 'app-audience-discount-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldChoiceRowComponent,
    FoldElementTitleComponent,
    FoldFieldsetComponent,
    FoldMultiselectComponent,
    PriceAlterationField,
  ],
  templateUrl: './audience-discount-card.html',
  styleUrl: './audience-discount-card.scss',
})
export class AudienceDiscountCard {
  private readonly sites = inject(SitesService);
  private readonly notify = inject(NotifyService);

  readonly site = input.required<SiteView>();
  readonly audience = input.required<CustomerAudience>();
  readonly catalogue = input.required<DiscountCatalogue>();
  readonly readOnly = input(false);
  readonly saved = output();

  protected readonly scopes = SCOPES;

  private readonly stored = computed(() => this.site().discounts[this.audience()], {
    equal: sameDiscount,
  });
  protected readonly draft = linkedSignal<DiscountDraft>(() => draftOf(this.stored()));
  protected readonly saving = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly title = computed(() => AUDIENCE_TITLE[this.audience()]);
  protected readonly wording = computed(() => WORDING[this.draft().scope]);
  protected readonly alteration = computed(() =>
    fromCartAdjustment(this.draft().adjustment, 'decrease'),
  );
  protected readonly hasDiscount = computed(() => this.draft().adjustment !== null);

  protected readonly familyOptions = computed<readonly FoldSelectItem<string>[]>(() =>
    this.catalogue().families.map((family) => ({ value: family.id, label: family.label })),
  );
  protected readonly families = computed(() => chosenFamilies(this.draft(), this.catalogue()));
  protected readonly products = computed(() =>
    chosenProducts(this.draft(), this.catalogue(), false),
  );
  protected readonly contradicting = computed(() =>
    chosenProducts(this.draft(), this.catalogue(), true),
  );
  /** Un produit ne se règle qu'une fois : ce que l'autre liste a pris n'est pas proposé. */
  protected readonly productOptions = computed(() => this.productItems(this.contradicting()));
  protected readonly contradictingOptions = computed(() => this.productItems(this.products()));
  protected readonly stray = computed(() => strayRules(this.draft(), this.catalogue()));

  protected readonly dirty = computed(() => !sameDiscount(discountOf(this.draft()), this.stored()));
  protected readonly canSave = computed(() => !this.readOnly() && this.dirty() && !this.saving());

  protected setDiscount(alteration: PriceAlteration | null): void {
    this.change((d) => ({ ...d, adjustment: toCartAdjustment(alteration) }));
  }

  protected setScope(key: string): void {
    if (key === 'all_except' || key === 'only') {
      this.change((d) => withScope(d, key));
    }
  }

  protected setFamilies(ids: readonly string[]): void {
    this.change((d) => withFamilies(d, ids, this.catalogue()));
  }

  protected setProducts(ids: readonly string[], contradicting: boolean): void {
    this.change((d) => withProducts(d, ids, contradicting, this.catalogue()));
  }

  protected remove(rule: StrayRule): void {
    this.change((d) => withoutRule(d, rule));
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const site = this.site();
    try {
      await this.sites.update(
        site.id,
        placePayload(site, {
          discounts: { ...site.discounts, [this.audience()]: discountOf(this.draft()) },
        }),
      );
      this.notify.success(`Réduction de retrait des ${this.title().toLowerCase()} enregistrée.`);
      this.saved.emit();
    } catch (error) {
      this.refusal.set(
        httpErrorMessage(error, "La réduction de retrait n'a pas pu être enregistrée."),
      );
    } finally {
      this.saving.set(false);
    }
  }

  private change(edit: (draft: DiscountDraft) => DiscountDraft): void {
    this.draft.update(edit);
    this.refusal.set(null);
  }

  private productItems(taken: readonly string[]): FoldSelectItem<string>[] {
    const excluded = new Set(taken);
    return this.catalogue()
      .productGroups.map((group) => ({
        label: group.label,
        options: group.products
          .filter((product) => !excluded.has(product.id))
          .map((product) => ({ value: product.id, label: product.label })),
      }))
      .filter((group) => group.options.length > 0);
  }
}

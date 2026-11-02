import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  effect,
  linkedSignal,
  output,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FoldCalloutComponent, FoldDisclosureComponent } from 'fold-ng';

import { formatCents, formatMillicents } from '../../../client/format-money';
import { ClientDialog } from '../../../client/dialog/client-dialog';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import type { ShopItemView } from '@lfd/contracts';
import { millicentsFromCents, unitPriceCents } from '@lfd/money';

import { ClientLocale } from '../../client-locale.service';
import { madeToOrderLabel } from '../made-to-order';
import { lockedReason } from '../locked-item';
import { operationGate, pickupSpan } from '../operations';
import { artOf, objectPositionOf } from '../shelf-display';
import { HouseMark } from '../house-mark/house-mark';
import { mediaSrcset, sizedMedia, SHEET_WIDTHS } from '../media-source';
import { ShopCatalogue } from '../shop-catalogue.store';
import { perKiloHintLabel, ShopPriceBasis, struckPriceLabel } from '../shop-price-basis.service';
import { ProVisit } from '../pro-visit.service';
import { FulfillmentOfferLabels } from '../promotion-offers';
import { QuantityRail } from '../quantity-rail/quantity-rail';
import { exceedsShelf, ShelfStockToday } from '../shelf-stock-today.store';
import {
  firstQuantityOf,
  pieceMinimumOf,
  isSoldByWeight,
  lineTotalOf,
  nextQuantity,
  previousQuantity,
  quantityLabel,
} from '../sale-unit';
import { StaffProductSuggestion } from '../../suggestions/staff-product-suggestion.service';
import { StaffSuggestionCard } from '../../suggestions/staff-suggestion-card/staff-suggestion-card';

/** Les lots qu'un professionnel commande d'un geste (handoff boutique, SPEC §6). */
const BATCHES: readonly number[] = [6, 12, 24];

/** Ce que le bouton du pied dit, selon le panier et le brouillon. */
export type SheetCtaState = 'add' | 'update' | 'inCart';

/**
 * La fiche d'une pièce — le geste LENT du rayon.
 *
 * Elle répond à ce que la vignette ne dit pas : le nom entier, la note du
 * fournil, la fournée, et le prix par pièce avec ce qu'il économise sur le
 * tarif boutique quand le serveur le sert.
 *
 * 🔴 **La quantité y est un BROUILLON.** Le stepper et les raccourcis de lot
 * règlent une quantité locale, initialisée à ce qui est au panier (ou 1) ; seul
 * le bouton du pied l'écrit, par `quantitySet`. On compose un lot de douze sans
 * que le panier passe par un, deux, trois… sous les yeux.
 *
 * Ce que la maquette montre et que le serveur ne sert pas — pièce, clôture —
 * n'a PAS de ligne ici : une ligne vide ou inventée mentirait (plan
 * `architecture-boutique-pro-cartes-et-fiche.md`). Les allergènes, servis
 * depuis le 2026-10-27, ont leur bloc (`plan-allergenes-en-boutique.md`).
 */
@Component({
  selector: 'app-product-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientDialog,
    FoldCalloutComponent,
    FoldDisclosureComponent,
    HouseMark,
    NgTemplateOutlet,
    QuantityRail,
    StaffSuggestionCard,
  ],
  templateUrl: './product-sheet.html',
  styleUrl: './product-sheet.scss',
})
export class ProductSheet {
  /** `null` ferme la feuille : il n'y a pas de fiche sans pièce à montrer. */
  readonly product = input.required<ShopItemView | null>();

  /** Ce qui est AU PANIER — la référence du brouillon, jamais modifiée ici. */
  readonly quantity = input(0);

  readonly closed = output<void>();

  /** La quantité à poser au panier pour cette pièce — le brouillon validé. */
  readonly quantitySet = output<number>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly offers = inject(FulfillmentOfferLabels);
  private readonly basis = inject(ShopPriceBasis);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);

  /**
   * La suggestion du staff sous l'article (RS2, fiche) : demandée une fois
   * par ouverture, rien sans règle applicable, jamais la pièce ouverte.
   */
  protected readonly staffPick = inject(StaffProductSuggestion);

  /** L'article ouvert, par son SKU : un catalogue relu ne rouvre pas la fiche. */
  private readonly openSku = computed(() => this.product()?.sku ?? null);

  constructor() {
    effect(() => {
      const sku = this.openSku();
      untracked(() => (sku === null ? this.staffPick.close() : this.staffPick.open(sku)));
    });
    inject(DestroyRef).onDestroy(() => this.staffPick.close());
  }

  /** L'opération datée qui rend la pièce vendable, ou `null` : un article courant. */
  private readonly operation = computed(() => {
    const key = this.product()?.operation?.key;
    return key === undefined ? null : this.catalogue.operationOf(key);
  });

  /**
   * L'état d'un article réservé à une opération (D8) : tant qu'elle n'est pas
   * ouverte, la fiche ne propose pas d'ajouter, et dit pourquoi.
   */
  protected readonly gate = computed(() => {
    const product = this.product();
    if (product === null) {
      return null;
    }
    // Réservé à un autre compte (`plan-articles-sur-mesure.md`, L3) : ni
    // quantité, ni ajout — la raison en phrase, à leur place.
    const locked = lockedReason(product, this.t());
    if (locked !== null) {
      return { orderable: false, label: locked.sentence };
    }
    // Plus rien en vitrine aujourd'hui (`plan-jour-meme-sur-stock.md`, L7).
    if (this.shelfStock.stateOf(product.sku) === 'absent') {
      return { orderable: false, label: this.t().shop.shelfGoneHint };
    }
    return operationGate(product, this.operation(), this.locale.current(), this.t());
  });

  protected readonly showsTtc = this.basis.showsTtc;

  /** La limite propre de la pièce, plus stricte que la générale — ou rien (2026-10-21). */
  protected readonly madeToOrder = computed(() =>
    madeToOrderLabel(this.product()?.orderTimeLimit, this.locale.current(), this.t().product),
  );

  /**
   * Le brouillon : ce qui est au panier, ou une pièce. Il se réaligne quand la
   * fiche change de pièce ou que le panier bouge sous elle.
   */
  protected readonly draft = linkedSignal(() => Math.max(this.quantity(), this.first()));

  /**
   * La plus petite quantité de la fiche : une pièce ; au poids, le premier
   * multiple du pas qui atteint le minimum (P4). Un article au poids sans pas
   * garde 1 : le serveur le refusera, et le refus se lira au panier.
   */
  protected readonly first = computed(() => {
    const product = this.product();
    return product === null ? 1 : (firstQuantityOf(product) ?? 1);
  });

  /** Vendu au poids : le sélecteur avance au pas, et dit des grammes. */
  protected readonly byWeight = computed(() => {
    const product = this.product();
    return product !== null && isSoldByWeight(product);
  });

  /** Le brouillon dit : « 3 », ou « 500 g ». */
  protected readonly draftLabel = computed(() =>
    quantityLabel(this.draft(), this.byWeight() ? 'weight' : 'piece'),
  );

  /** « / pièce », ou « / kg » au poids. */
  protected readonly perUnit = computed(() =>
    this.byWeight() ? this.t().product.perKilogram : this.t().product.perPiece,
  );

  /** Les raccourcis de lot : un geste de professionnel, absent pour un particulier. */
  protected readonly batches = computed(() => {
    const c = this.t().product;
    // Les lots sont des pièces : un article au poids n'en propose pas.
    return this.showsTtc() || this.byWeight()
      ? []
      : // Un lot sous le minimum poserait une quantité que le serveur refuse.
        BATCHES.filter((size) => size >= this.first()).map((size) => ({
          size,
          label: fill(c.batch, { n: String(size) }),
          aria: fill(c.batchAria, { n: String(size) }),
        }));
  });

  /** Le nom du rayon vient du CATALOGUE : c'est lui qui range, pas cet écran. */
  protected readonly shelf = computed(() => {
    const product = this.product();
    if (product === null) {
      return '';
    }
    return this.catalogue.shelves().find((shelf) => shelf.id === product.shelfId)?.name ?? '';
  });

  /**
   * L'ouverture, à la largeur de la fiche. Mesuré : 123 ko à 1800 px, contre
   * 3,64 Mo pour le master.
   */
  protected readonly artSrc = computed(() => {
    const visual = this.art();
    return visual === null ? '' : sizedMedia(visual.url, SHEET_WIDTHS[0]);
  });

  protected readonly artSrcset = computed(() => {
    const visual = this.art();
    return visual === null ? '' : mediaSrcset(visual.url, SHEET_WIDTHS);
  });

  protected readonly art = computed(() => {
    const product = this.product();
    return product === null ? null : artOf(product);
  });

  /** Le recadrage de l'ouverture autour du point focal — le centre sans lui. */
  protected readonly artPosition = computed(() => {
    const visual = this.art();
    return visual === null ? null : objectPositionOf(visual);
  });

  /**
   * **Les allergènes, puis les traces** (`plan-allergenes-en-boutique.md`,
   * Hugo, 2026-10-27) — des libellés servis dans la langue de la requête ;
   * cet écran n'en nomme aucun. Rien quand le serveur ne sait pas : jamais
   * « aucun allergène » par défaut.
   *
   * 🔴 « Peut contenir » ne paraît jamais seul : la liste des allergènes (ou
   * « Aucun allergène », déclaré) la précède toujours ; sous précaution, un
   * encadré d'avertissement dit « Information précise non disponible » avant
   * les traces complètes. Sur la fiche seulement — ni vignette, ni panier
   * (Hugo, 2026-10-27).
   */
  protected readonly allergens = computed(() => {
    const served = this.product()?.allergens;
    if (served === undefined) {
      return null;
    }
    const precautionary = served.state === 'precautionary';
    return {
      contains: served.contains,
      none: served.state === 'none',
      mayContain: served.mayContain,
      precautionary,
    };
  });

  /**
   * Les faits servis — les jours de retrait d'une opération ouverte. La
   * fournée a cédé sa place aux allergènes (Hugo, 2026-10-27).
   */
  protected readonly facts = computed(() => {
    const product = this.product();
    return product === null ? [] : this.pickupFact(product);
  });

  /**
   * Le prix unitaire en MILLICENTIMES, dans l'assiette de qui regarde. Le TTC
   * arrive du serveur en centimes : on le remonte d'échelle plutôt que de le
   * dériver du hors taxe, pour ne pas diverger du panier d'un centime.
   */
  private readonly unitMillicents = computed(() => {
    const product = this.product();
    if (product === null) {
      return 0;
    }
    return this.showsTtc()
      ? millicentsFromCents(product.unitPriceTtcCents)
      : product.unitPriceMillicents;
  });

  /** Au centime pour un particulier ; le HT exact pour un pro (§ 18.6, option (b)). */
  protected readonly price = computed(() =>
    this.showsTtc()
      ? formatCents(unitPriceCents(this.unitMillicents()))
      : formatMillicents(this.unitMillicents()),
  );

  /** La mention d'assiette : la vignette la porte, la fiche ne la perd pas. */
  protected readonly basisSuffix = computed(() =>
    this.showsTtc() ? this.t().shop.ttcSuffix : this.t().shop.htSuffix,
  );

  /** « 12,40 € / kg TTC » sous le prix d'une pièce, quand le référentiel l'a saisi. */
  /**
   * « −20 % client Folie Coffee », ou la valeur seule — les promotions qu'un
   * acheminement ouvert au lecteur appliquerait, sans que le prix affiché les
   * compte (L10, `plan-texte-de-la-vignette.md`).
   */
  protected readonly offerLabels = computed(() => {
    const product = this.product();
    return product === null ? [] : this.offers.of(product);
  });

  /** « Minimum 6 pièces » sous le prix, ou `null` sans minimum (plan quantité minimale, Q4). */
  protected readonly minimumLabel = computed(() => {
    const product = this.product();
    const minimum = product === null ? null : pieceMinimumOf(product);
    return minimum === null ? null : fill(this.t().product.minimumPieces, { n: String(minimum) });
  });

  protected readonly perKiloHint = computed(() => {
    const product = this.product();
    return product === null
      ? null
      : perKiloHintLabel(
          product,
          this.showsTtc(),
          this.basisSuffix(),
          this.t().product.perKilogram,
        );
  });

  /** Le tarif boutique barré — même règle que la vignette : l'absence EST la réponse. */
  protected readonly striked = computed(() =>
    struckPriceLabel(this.product() ?? {}, this.showsTtc()),
  );

  /** Ce qu'entend un lecteur d'écran à la place des prix (RGAA 3.1, lot A5). */
  protected readonly struckPhrase = computed(() =>
    fill(this.t().shop.priceStruck, {
      was: this.striked() ?? '',
      now: `${this.price()} ${this.basisSuffix()} ${this.perUnit()}`,
    }),
  );

  /**
   * Le nom de la baisse, tel que réglé sur la promotion — ou `null`.
   *
   * 🔴 Aucun libellé n'est fabriqué ici (règle de Hugo, 2026-11-02) : une
   * baisse qui ne vient pas d'une promotion (mercuriale, palier) ne dit rien
   * de plus que le prix. Le serveur ne sert `promotionNames` que dans ce cas.
   */
  protected readonly discountLabel = computed(() => {
    const names = this.product()?.promotionNames ?? [];
    return names.length === 0 ? null : names.join(' · ');
  });

  protected readonly ctaState = computed<SheetCtaState>(() => {
    const inCart = this.quantity();
    if (inCart === 0) {
      return 'add';
    }
    return this.draft() === inCart ? 'inCart' : 'update';
  });

  private readonly proVisit = inject(ProVisit).active;

  protected readonly ctaLabel = computed(() => {
    const c = this.t().product;
    // En visite pro, le bouton ouvre la connexion : il ne promet pas un ajout.
    if (this.proVisit()) {
      return c.signInToOrder;
    }
    switch (this.ctaState()) {
      case 'add':
        return fill(c.addCount, { n: this.draftLabel() });
      case 'update':
        return c.update;
      case 'inCart':
        return c.inCart;
    }
  });

  /** Le total de ce qu'on emporte, dans la même assiette que le prix affiché. */
  protected readonly total = computed(() =>
    formatCents(
      lineTotalOf(this.unitMillicents(), this.draft(), this.byWeight() ? 'weight' : 'piece'),
    ),
  );

  protected readonly addLabel = computed(() =>
    fill(this.t().shop.addAria, { name: this.product()?.name ?? '' }),
  );

  protected readonly removeLabel = computed(() =>
    fill(this.t().shop.removeAria, { name: this.product()?.name ?? '' }),
  );

  /**
   * Les jours de retrait d'une opération OUVERTE, en ligne discrète : c'est ce
   * que le calendrier proposera, et le dire avant évite de chercher un jour
   * que la commande refuserait.
   */
  private pickupFact(product: ShopItemView): readonly { key: string; value: string }[] {
    const operation = this.operation();
    if (product.operation?.state !== 'open' || operation === null) {
      return [];
    }
    const copy = this.t();
    return [
      {
        key: copy.product.operationPickup,
        value: pickupSpan(operation, this.locale.current(), copy),
      },
    ];
  }

  private readonly shelfStock = inject(ShelfStockToday);

  /** « Plus que 3 aujourd'hui » — `null` hors aujourd'hui ou sans reste connu. */
  protected readonly shelfLabel = computed(() => {
    const product = this.product();
    const state = product === null ? null : this.shelfStock.stateOf(product.sku);
    if (state === null || state === 'absent') {
      return null;
    }
    return fill(this.t().shop.shelfLeft, { left: quantityLabel(state.left, state.saleUnit) });
  });

  /** Le « + » s'arrête au reste d'aujourd'hui ; la mention dit pourquoi. */
  protected increment(): void {
    const product = this.product();
    this.draft.update((n) => {
      if (product === null) {
        return n + 1;
      }
      const next = nextQuantity(product, n);
      return exceedsShelf(this.shelfStock.stateOf(product.sku), next) ? n : next;
    });
  }

  /** Un pas de moins, jamais sous la première quantité : la fiche n'ajoute pas zéro. */
  protected decrement(): void {
    const product = this.product();
    this.draft.update((n) =>
      Math.max(product === null ? n - 1 : previousQuantity(product, n), this.first()),
    );
  }

  protected commit(): void {
    if (this.ctaState() !== 'inCart') {
      this.quantitySet.emit(this.draft());
    }
  }
}

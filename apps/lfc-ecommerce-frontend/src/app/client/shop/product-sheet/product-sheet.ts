import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import { formatCents } from '../../../client/format-money';
import { ClientDialog } from '../../../client/dialog/client-dialog';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import type { ShopItemView } from '@lfd/contracts';
import { discountBp, lineTotalCents, millicentsFromCents, unitPriceCents } from '@lfd/money';

import { ClientLocale } from '../../client-locale.service';
import { operationGate, pickupSpan } from '../operations';
import { artOf, ovenHoursOf } from '../shelf-display';
import { mediaSrcset, sizedMedia, SHEET_WIDTHS } from '../media-source';
import { ShopCatalogue } from '../shop-catalogue.store';
import { ShopPriceBasis } from '../shop-price-basis.service';
import { QuantityRail } from '../quantity-rail/quantity-rail';

/** Les lots qu'un professionnel commande d'un geste (handoff boutique, SPEC §6). */
const BATCHES: readonly number[] = [6, 12, 24];

/** Un point de base par centième de pour cent : 100 bp font 1 %. */
const BP_PER_PERCENT = 100;

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
 * Ce que la maquette montre et que le serveur ne sert pas — pièce, allergènes,
 * clôture — n'a PAS de ligne ici : une ligne vide ou inventée mentirait
 * (plan `plan-boutique-pro-cartes-et-fiche.md`).
 */
@Component({
  selector: 'app-product-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientDialog, QuantityRail],
  templateUrl: './product-sheet.html',
  styleUrl: './product-sheet.scss',
})
export class ProductSheet {
  /** `null` ferme la feuille : il n'y a pas de fiche sans pièce à montrer. */
  readonly product = input.required<ShopItemView | null>();

  /** Ce qui est AU PANIER — la référence du brouillon, jamais modifiée ici. */
  readonly quantity = input(0);

  /**
   * La boutique permet-elle d'ajouter au panier ? Faux au niveau `browse` (plan
   * `plan-inscription-pro-seule.md` §4) : le pied de la fiche porte alors la
   * mention à la place du stepper et du bouton.
   */
  readonly orderable = input(true);

  readonly closed = output<void>();

  /** La quantité à poser au panier pour cette pièce — le brouillon validé. */
  readonly quantitySet = output<number>();

  protected readonly t = inject(ClientCopyService).t;
  private readonly basis = inject(ShopPriceBasis);
  private readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);

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
    return product === null
      ? null
      : operationGate(product, this.operation(), this.locale.current(), this.t());
  });

  protected readonly showsTtc = this.basis.showsTtc;

  /**
   * Le brouillon : ce qui est au panier, ou une pièce. Il se réaligne quand la
   * fiche change de pièce ou que le panier bouge sous elle.
   */
  protected readonly draft = linkedSignal(() => {
    this.product();
    return Math.max(this.quantity(), 1);
  });

  /** Les raccourcis de lot : un geste de professionnel, absent pour un particulier. */
  protected readonly batches = computed(() => {
    const c = this.t().product;
    return this.showsTtc()
      ? []
      : BATCHES.map((size) => ({
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

  /**
   * Les faits servis — la fournée, et les jours de retrait d'une opération
   * ouverte ; pièce et allergènes ne traversent pas encore.
   */
  protected readonly facts = computed(() => {
    const product = this.product();
    return product === null
      ? []
      : [
          { key: this.t().product.oven, value: ovenHoursOf(product.shelfId) },
          ...this.pickupFact(product),
        ];
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

  protected readonly price = computed(() => formatCents(unitPriceCents(this.unitMillicents())));

  /** La mention d'assiette : la vignette la porte, la fiche ne la perd pas. */
  protected readonly basisSuffix = computed(() =>
    this.showsTtc() ? this.t().shop.ttcSuffix : this.t().shop.htSuffix,
  );

  /** Le tarif boutique barré — même règle que la vignette : l'absence EST la réponse. */
  protected readonly striked = computed(() => {
    const catalogue = this.product()?.catalogPriceMillicents;
    return catalogue === undefined ? null : formatCents(unitPriceCents(catalogue));
  });

  /**
   * L'écart au tarif boutique, en pour cent entier — ou `null` quand il n'y a
   * rien à dire. Dérivé des deux montants servis, tous deux hors taxe : aucun
   * pourcentage n'est stocké, aucun n'est inventé.
   */
  protected readonly discountPercent = computed(() => {
    const product = this.product();
    const catalogue = product?.catalogPriceMillicents;
    if (product === null || catalogue === undefined) {
      return null;
    }
    const percent = Math.round(discountBp(catalogue, product.unitPriceMillicents) / BP_PER_PERCENT);
    return percent > 0 ? percent : null;
  });

  protected readonly discountLabel = computed(() => {
    const percent = this.discountPercent();
    return percent === null ? null : fill(this.t().product.proDiscount, { pct: String(percent) });
  });

  protected readonly ctaState = computed<SheetCtaState>(() => {
    const inCart = this.quantity();
    if (inCart === 0) {
      return 'add';
    }
    return this.draft() === inCart ? 'inCart' : 'update';
  });

  protected readonly ctaLabel = computed(() => {
    const c = this.t().product;
    switch (this.ctaState()) {
      case 'add':
        return fill(c.addCount, { n: String(this.draft()) });
      case 'update':
        return c.update;
      case 'inCart':
        return c.inCart;
    }
  });

  /** Le total de ce qu'on emporte, dans la même assiette que le prix affiché. */
  protected readonly total = computed(() =>
    formatCents(lineTotalCents(this.unitMillicents(), this.draft())),
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

  protected increment(): void {
    this.draft.update((n) => n + 1);
  }

  protected decrement(): void {
    this.draft.update((n) => Math.max(n - 1, 1));
  }

  protected commit(): void {
    if (this.ctaState() !== 'inCart') {
      this.quantitySet.emit(this.draft());
    }
  }
}

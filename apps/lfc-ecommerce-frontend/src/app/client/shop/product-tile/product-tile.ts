import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldBadgeComponent, FoldIconComponent } from 'fold-ng';

import { formatCents } from '../../../client/format-money';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import type { ShopItemView } from '@lfd/contracts';
import { unitPriceCents } from '@lfd/money';
import {
  formatSpec,
  type MediaFit,
  type MediaSide,
  sideForShape,
  type StorefrontShape,
  type StorefrontTone,
  toneApplies,
} from '@lfd/storefront-layout';

import { ClientLocale } from '../../client-locale.service';
import { allergenMention } from '../allergen-mention';
import { madeToOrderShortLabel } from '../made-to-order';
import { ShopAllergenDisplay } from '../storefront/allergen-display.service';
import { operationGate } from '../operations';
import { ShopCatalogue } from '../shop-catalogue.store';
import { objectPositionOf, tileArtOf } from '../shelf-display';
import { HouseMark } from '../house-mark/house-mark';
import { mediaSrcset, sizedMedia, TILE_WIDTHS } from '../media-source';
import { shelfPriceLabel, ShopPriceBasis } from '../shop-price-basis.service';
import { ProVisit } from '../pro-visit.service';
import { quantityLabel, saleUnitOf } from '../sale-unit';

/**
 * Une pièce du rayon — la vignette de la grille.
 *
 * Elle porte DEUX gestes : le bouton en bas à droite ajoute sans quitter le
 * rayon (le geste de l'habitué), la photo et le nom ouvrent la fiche (le geste
 * de celui qui veut savoir). Le bouton porte la quantité une fois l'article au
 * panier ; le retrait se fait dans la fiche.
 *
 * La maquette de la boutique pro a unifié les deux densités : la pastille sur
 * la photo et le stepper « au-delà du pli » ont disparu au profit de ce seul
 * bouton de 44 px, cible tenable au pouce comme à la souris.
 *
 * **Sa forme décide de sa mise en page** (`boutique-rayon-layout.md`,
 * D10). Posée par la vitrine, elle reçoit sa forme, son cadrage, son côté
 * d'image et son ton : en carte 1×1, c'est la vignette d'aujourd'hui ; sur une
 * forme plus grande, c'est le best-seller — photo à côté au bureau si le côté
 * le veut, au-dessus en pile. C'est la GRILLE qui l'étire, par sa case ; la
 * vignette ne fait que changer de disposition.
 *
 * Sans forme (`null`), elle est dans le rayon d'avant la vitrine : le
 * best-seller y est celui que le catalogue marque (`isFeatured`), et la grille
 * lui donne deux colonnes. C'est le rendu d'un rayon dont la page ne pose aucun
 * objet.
 */
@Component({
  selector: 'app-product-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldIconComponent, HouseMark],
  templateUrl: './product-tile.html',
  styleUrl: './product-tile.scss',
})
export class ProductTile {
  readonly product = input.required<ShopItemView>();

  /** Ce qu'il y a déjà au panier. Zéro : le bouton redevient un « + ». */
  readonly quantity = input(0);

  /** La forme de sa case de vitrine ; `null` hors vitrine composée. */
  readonly shape = input<StorefrontShape | null>(null);
  readonly mediaFit = input<MediaFit>('cover');
  /** Absent : le côté par défaut de la forme. */
  readonly mediaSide = input<MediaSide | null>(null);
  readonly tone = input<StorefrontTone>('light');

  readonly opened = output<void>();
  readonly added = output<void>();
  /** Le « − » : une pièce de moins. N'existe qu'une fois l'article au panier. */
  readonly removed = output<void>();

  /**
   * La mise en page du best-seller : sur toute forme autre que la carte 1×1,
   * ou — hors vitrine — quand le catalogue marque l'article.
   */
  protected readonly featured = computed(() => {
    const shape = this.shape();
    return shape === null ? this.product().isFeatured : shape !== 'card';
  });

  /**
   * Les classes de mise en page. Le côté ne se lit qu'au bureau : en pile, le
   * CSS remet l'image au-dessus (`mobileSide` du paquet — deux colonnes ou
   * moins). Le ton ne se voit pas sur une carte 1×1 (`toneApplies`) : elle
   * garde le rendu du rayon, pour que la grille reste homogène.
   */
  private readonly side = computed<MediaSide>(() => {
    const shape = this.shape();
    if (!this.featured()) {
      return 'top';
    }
    return shape === null ? 'left' : sideForShape(shape, this.mediaSide() ?? undefined);
  });

  protected readonly layout = computed(() => {
    const shape = this.shape();
    const side = this.side();
    if (!this.featured()) {
      return 'side-top';
    }
    const tone =
      shape !== null && toneApplies(shape, [{ kind: 'product' }]) ? this.tone() : 'light';
    const tall = shape !== null && formatSpec(shape).rows > 1 ? ' tall' : '';
    return `side-${side} tone-${tone}${tall}`;
  });

  protected readonly t = inject(ClientCopyService).t;
  private readonly catalogue = inject(ShopCatalogue);
  private readonly locale = inject(ClientLocale);

  /**
   * **L'état d'un article réservé à une opération datée** (D8) : annoncée, le
   * « + » devient « Ouvre le 15 nov. » ; close, « Commandes closes ». Un
   * article courant n'en porte pas, et rien ne change pour lui.
   */
  protected readonly gate = computed(() => {
    const product = this.product();
    const key = product.operation?.key;
    return operationGate(
      product,
      key === undefined ? null : this.catalogue.operationOf(key),
      this.locale.current(),
      this.t(),
    );
  });

  /**
   * **« Sur commande · 2 jours avant 12 h »** (Hugo, 2026-10-21) : la limite
   * propre de l'article, en court — servie seulement quand elle est plus
   * stricte que la règle générale. La phrase longue est sur la fiche.
   */
  private readonly allergenDisplay = inject(ShopAllergenDisplay).current;

  /**
   * La mention compacte des allergènes — seulement quand la vitrine les
   * montre « aussi dans la galerie » (réglage global, Hugo, 2026-10-27) ; par
   * défaut, la carte n'en dit rien et la fiche les donne.
   */
  protected readonly allergens = computed(() =>
    this.allergenDisplay() === 'gallery'
      ? allergenMention(this.product().allergens, this.t().product)
      : [],
  );

  protected readonly madeToOrder = computed(() =>
    madeToOrderShortLabel(this.product().orderTimeLimit, this.locale.current(), this.t().product),
  );

  /**
   * Le prix **dans l'assiette de qui regarde**, sans sa mention — le gabarit la
   * pose à côté.
   *
   * Un prix alimentaire affiché sans mention se lit TTC en France : `1,00 €` sur
   * une vignette qui pense HT ment à son lecteur. Elle est donc obligatoire.
   * Mais elle QUALIFIE le prix, elle n'en fait pas partie : écrite du même
   * corps et de la même graisse, elle pesait autant que le montant qu'on vient
   * lire. D'où deux fragments plutôt qu'une chaîne.
   *
   * 🔴 **Le hors taxe était servi à TOUT LE MONDE jusqu'au 2026-09-21**, mention
   * comprise. C'était honnête et ce n'était pas juste : un particulier ne
   * récupère pas la taxe, et lui demander d'ajouter 5,5 % de tête devant un
   * rayon est une façon de ne pas vendre. Le TTC arrive du serveur — le dériver
   * ici l'aurait fait diverger du panier d'un centime.
   */
  private readonly basis = inject(ShopPriceBasis);

  protected readonly showsTtc = this.basis.showsTtc;

  /** La pastille : « 3 » pièces, ou « 500 g » au poids. */
  protected readonly quantityText = computed(() =>
    quantityLabel(this.quantity(), saleUnitOf(this.product())),
  );

  protected readonly price = computed(() =>
    shelfPriceLabel(this.product(), this.showsTtc(), this.t().product.perKilogram),
  );

  /**
   * **Le tarif catalogue barré**, ou `null` quand il n'y a rien à barrer.
   *
   * Le serveur ne remplit `catalogPriceMillicents` que sur les articles où le
   * prix servi diffère du tarif : l'absence EST la réponse, et la revérifier
   * ici ferait une seconde règle qui pourrait diverger de la sienne.
   *
   * Formaté comme le prix courant — centimes arrondis — et non en
   * millicentimes : deux échelles côte à côte se lisent mal, et « 2,1327 € »
   * barré au-dessus de « 1,73 € » ferait chercher une précision qui n'a pas de
   * sens sur une vignette.
   */
  protected readonly striked = computed(() => {
    const catalogue = this.product().catalogPriceMillicents;
    return catalogue === undefined ? null : formatCents(unitPriceCents(catalogue));
  });

  /** Ce qu'entend un lecteur d'écran à la place des deux prix (RGAA 3.1, lot A5). */
  protected readonly struckPhrase = computed(() => {
    const shop = this.t().shop;
    return fill(shop.priceStruck, {
      was: this.striked() ?? '',
      now: `${this.price()} ${this.showsTtc() ? shop.ttcSuffix : shop.htSuffix}`,
    });
  });

  /** Le visuel du référentiel, ou l'illustration de son rayon. */
  /**
   * En rayon, c'est la VIGNETTE qui prime — puis l'ouverture, puis
   * l'illustration du rayon. Voir `tileArtOf` pour le sens du repli.
   */
  protected readonly art = computed(() => tileArtOf(this.product()));

  /** Le recadrage autour du point focal — le centre sans lui. */
  protected readonly artPosition = computed(() => objectPositionOf(this.art()));

  /**
   * L'image **à la taille de la tuile**, et non le master.
   *
   * 🔴 La vitrine posait l'URL du master : mesuré sur la photo de production,
   * 3,64 Mo servis dans une tuile de 180 px. À 720 px et en format négocié,
   * la même photo fait 21,5 ko.
   *
   * `src` porte la plus petite largeur — c'est le repli d'un navigateur qui
   * ignore `srcset`, et il doit être léger, pas fidèle.
   */
  protected readonly artSrc = computed(() => sizedMedia(this.art().url, TILE_WIDTHS[0]));

  protected readonly artSrcset = computed(() => mediaSrcset(this.art().url, TILE_WIDTHS));

  private readonly proVisit = inject(ProVisit).active;

  /** En visite pro, le « + » ouvre la connexion — et le dit (2026-10-19). */
  protected readonly addLabel = computed(() => {
    const shop = this.t().shop;
    const template = this.proVisit() ? shop.addAriaProVisit : shop.addAria;
    return fill(template, { name: this.product().name });
  });

  protected readonly removeLabel = computed(() =>
    fill(this.t().shop.removeAria, { name: this.product().name }),
  );

  /**
   * La place que l'image prendra : une colonne sur cinq par colonne couverte
   * au bureau, la moitié de l'écran par colonne en pile. Un best-seller hors
   * vitrine couvre deux colonnes.
   */
  protected readonly sizes = computed(() => {
    const shape = this.shape();
    const spec = shape === null ? null : formatSpec(shape);
    const desk = spec?.columns ?? (this.product().isFeatured ? 2 : 1);
    const pile = spec?.mobileColumns ?? desk;
    const share = this.side() === 'left' || this.side() === 'right' ? 0.5 : 1;
    return `(min-width: 900px) ${Math.round(desk * 20 * share)}vw, ${Math.min(pile, 2) * 50}vw`;
  });
}

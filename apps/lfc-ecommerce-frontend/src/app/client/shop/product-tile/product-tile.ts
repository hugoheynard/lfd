import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { formatCents } from '../../../client/format-money';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';
import type { ShopItemView } from '@lfd/contracts';
import { unitPriceCents } from '@lfd/money';

import { artOf } from '../shelf-display';
import { mediaSrcset, sizedMedia, TILE_WIDTHS } from '../media-source';
import { ShopPriceBasis } from '../shop-price-basis.service';
import { QuantityRail } from '../quantity-rail/quantity-rail';

/**
 * Une pièce du rayon — la vignette de la grille.
 *
 * Elle porte DEUX gestes à la même place, et c'est tout son propos : le « + »
 * posé sur la photo ajoute sans quitter le rayon (le geste de l'habitué), la
 * vignette ouvre la fiche (le geste de celui qui veut savoir). Deux vitesses,
 * aucun menu.
 *
 * La densité change avec le pli, pas le modèle. En pile, la tuile fait ~112 px :
 * un stepper à trois zones y donnerait des cibles de 24 px, donc le bouton
 * devient une pastille qui porte la quantité et le retrait se fait dans la
 * fiche. Au-delà du pli la tuile fait ~166 px, le stepper complet y tient. Les
 * deux vivent dans le DOM et c'est le CSS qui choisit — le pli est une affaire
 * de largeur, que le rendu serveur ne connaît pas.
 */
@Component({
  selector: 'app-product-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, QuantityRail],
  templateUrl: './product-tile.html',
  styleUrl: './product-tile.scss',
})
export class ProductTile {
  readonly product = input.required<ShopItemView>();

  /** Ce qu'il y a déjà au panier. Zéro : la pastille redevient un « + ». */
  readonly quantity = input(0);

  /**
   * La boutique permet-elle d'ajouter au panier ? Faux au niveau `browse` (plan
   * `plan-inscription-pro-seule.md` §4) : la vignette se regarde, et le geste
   * d'ajout disparaît — à 112 px, il n'y a pas la place d'écrire pourquoi ; la
   * fiche le dit.
   */
  readonly orderable = input(true);

  readonly opened = output<void>();
  readonly added = output<void>();
  readonly removed = output<void>();

  protected readonly t = inject(ClientCopyService).t;

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

  protected readonly price = computed(() =>
    this.showsTtc()
      ? formatCents(this.product().unitPriceTtcCents)
      : formatCents(unitPriceCents(this.product().unitPriceMillicents)),
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

  /** Le visuel du référentiel, ou l'illustration de son rayon. */
  protected readonly art = computed(() => artOf(this.product()));

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

  protected readonly addLabel = computed(() =>
    fill(this.t().shop.addAria, { name: this.product().name }),
  );

  protected readonly removeLabel = computed(() =>
    fill(this.t().shop.removeAria, { name: this.product().name }),
  );
}

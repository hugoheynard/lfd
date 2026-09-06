import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { unitPriceCents } from '@lfd/money';
import { FoldIconComponent, FoldNumberInputComponent } from 'fold-ng';

import { formatCents } from '../../format-money';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { type CartLine } from '../cart-total';

/**
 * **Une ligne du panier** : la quantité, ce que c'est, ce que ça fait.
 *
 * Le sélecteur est `li[app-cart-product-line]` et non un élément à lui : la
 * liste est un `<ul>`, dont les seuls enfants valides sont des `<li>`. Un
 * élément intermédiaire obligerait à un `display: contents` pour rendre la
 * grille — et ce contournement retire l'élément de l'arbre d'accessibilité chez
 * certains lecteurs d'écran, donc la liste n'annoncerait plus ses items.
 * L'attribut règle le problème au lieu de le déplacer.
 *
 * Elle formate ses propres montants plutôt que de recevoir des chaînes : c'est
 * la seule façon que la mention `HT` soit posée là où le prix s'affiche. Un
 * parent qui préformate est un parent qui peut oublier la mention, et rien ne
 * le lui dirait.
 *
 * Elle règle sa quantité par `fold-number-input`, boutons **empilés dans le
 * champ**. Le rail du rayon (« − 3 + ») aurait fait un troisième contrôle à
 * apprendre, et surtout : au rayon on ajoute une pièce à la fois, au panier on
 * corrige — douze croissants ne se retirent pas en douze appuis. Le champ se
 * tape, il s'arrête à un, et la corbeille est le seul chemin vers zéro.
 *
 * `lfd-cart-row`, le panier du back-office, emploie le même composant : c'est
 * là qu'est la mutualisation qui paie — le CONTRÔLE, pas la peinture.
 *
 * ⚠️ Le trait qui la sépare de la suivante appartient à la LISTE, pas à elle —
 * une ligne ne connaît pas sa voisine, et un composant ne pose pas son écart.
 */
@Component({
  selector: 'li[app-cart-product-line]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent, FoldNumberInputComponent],
  // Le stepper n'expose pas de nom accessible : c'est la LIGNE qu'on nomme, et
  // le produit se lit alors avant la quantité comme avant la corbeille.
  host: { role: 'group', '[attr.aria-label]': 'name()' },
  templateUrl: './cart-product-line.html',
  styleUrl: './cart-product-line.scss',
})
export class CartProductLine {
  readonly line = input.required<CartLine>();

  /** La quantité voulue, telle que le champ la rend. Jamais zéro : cf. `min`. */
  readonly quantityChange = output<number>();
  /** Retirer la ligne ENTIÈRE — la corbeille, pas le « − ». */
  readonly dropped = output<void>();

  private readonly t = inject(ClientCopyService).t;

  protected readonly name = computed(() => this.line().product.name);

  protected readonly quantity = computed(() => this.line().quantity);

  /** Le prix d'UNE pièce, hors taxe, mention comprise. */
  protected readonly unit = computed(() =>
    fill(this.t().shop.priceHt, {
      price: formatCents(unitPriceCents(this.line().product.unitPriceMillicents)),
    }),
  );

  /**
   * Le total de la ligne, hors taxe.
   *
   * L'arrondi a lieu ICI, sur la quantité entière — jamais sur l'unité
   * multipliée : deux fois « 1,40 € » ne font pas forcément le total de deux
   * pièces, et c'est tout ce que le millicentime existe pour tenir.
   */
  /**
   * Le total de la ligne, **tel que le serveur l'a arrondi**.
   *
   * Il se calculait ici (`prix × quantité`). C'est un MONTANT : l'arrondir à
   * l'écran donnait une seconde règle d'arrondi, et une multiplication devient
   * fausse en silence dès qu'un palier de volume existe. `null` tant que le
   * décompte n'est pas revenu — un tiret vaut mieux qu'un nombre inventé.
   */
  readonly totalCents = input<number | null>(null);

  protected readonly sum = computed(() => {
    const cents = this.totalCents();
    return cents === null ? '—' : formatCents(cents);
  });

  protected readonly dropLabel = computed(() =>
    fill(this.t().cart.dropAria, { name: this.name() }),
  );

  /**
   * Le champ rend `null` quand on le vide. On ne propage pas ce vide : un champ
   * en cours d'édition n'est pas une intention de retirer la ligne — c'est ce
   * que la corbeille dit, et elle seule.
   */
  protected onQuantity(value: number | null): void {
    if (value !== null) {
      this.quantityChange.emit(value);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  numberAttribute,
  output,
} from '@angular/core';
import { FoldButtonIconComponent, FoldNumberInputComponent } from 'fold-ng';

import { formatCents } from '../../order/order-format';

/**
 * `lfd-cart-row` — **un article dans un panier**, tel que le client le voit.
 *
 * Le même article se règle depuis deux écrans : la page Panier du client, et la
 * colonne de saisie du back-office quand le commercial commande pour lui. Les
 * deux le rendaient différemment — vignette et stepper d'un côté, champ nombre
 * nu de l'autre — alors que c'est au téléphone que la différence coûte le plus
 * cher : le commercial décrit une ligne que le client ne reconnaît pas.
 *
 * **Le prix est en centimes**, et le formatage vit ici. Le panier client
 * raisonne en euros flottants ; lui laisser formater sa ligne aurait donné deux
 * arrondis pour un même montant.
 *
 * La quantité passe par `fold-number-input` : le stepper vaut mieux qu'un champ
 * libre pour la manipulation la plus fréquente de l'écran, et il borne la saisie
 * sans que l'appelant ait à valider. Zéro **retire** — c'est le même geste que la
 * corbeille, et les deux paniers l'implémentent déjà ainsi.
 */
@Component({
  selector: 'lfd-cart-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonIconComponent, FoldNumberInputComponent],
  templateUrl: './cart-row.html',
  styleUrl: './cart-row.scss',
  // Le stepper n'expose pas de nom accessible : c'est la LIGNE qu'on nomme, et
  // le produit se lit alors avant la quantité comme avant la corbeille.
  host: { role: 'group', '[attr.aria-label]': 'name()' },
})
export class CartRow {
  readonly name = input.required<string>();
  /** Prix unitaire **HT**, en centimes. */
  readonly unitPriceCents = input.required<number>();
  readonly quantity = input.required<number>();

  /**
   * Le tarif d'ENTRÉE, quand il diffère du prix appliqué.
   *
   * `null` = rien à signaler, et c'est le cas ordinaire. Dès qu'une mercuriale,
   * un palier de volume ou une promotion joue, la ligne montre les deux : le
   * prix barré et celui qui sera facturé. Sans ça, un commercial annonce au
   * téléphone un tarif que la commande contredit ensuite — et ne peut même pas
   * dire au client qu'il bénéficie de quelque chose.
   */
  readonly canonicalPriceCents = input<number | null>(null);

  /** L'unité de vente, telle qu'on la dit — « / kg », « la pièce ». */
  readonly unit = input('');
  /** La vignette du produit. `null` ⇒ l'initiale, qui vaut mieux qu'un trou. */
  readonly image = input<string | null>(null);
  readonly imageAlt = input('');

  /** Plancher du stepper. 1 par défaut : descendre à zéro passe par la corbeille. */
  readonly min = input(1, { transform: numberAttribute });

  readonly quantityChange = output<number>();
  readonly remove = output<void>();

  protected readonly unitPrice = computed(() => formatCents(this.unitPriceCents()));

  /** Le tarif barré — affiché **seulement** s'il diffère de ce qui est facturé. */
  protected readonly strikedPrice = computed(() => {
    const canonical = this.canonicalPriceCents();
    return canonical === null || canonical === this.unitPriceCents()
      ? null
      : formatCents(canonical);
  });
  protected readonly lineTotal = computed(() =>
    formatCents(this.unitPriceCents() * this.quantity()),
  );
  protected readonly initial = computed(() => this.name().charAt(0));

  /**
   * Le stepper rend `null` quand le champ est vidé. On ne propage pas ce vide :
   * un champ en cours d'édition n'est pas une intention de retirer la ligne.
   */
  protected onQuantity(value: number | null): void {
    if (value !== null) {
      this.quantityChange.emit(value);
    }
  }
}

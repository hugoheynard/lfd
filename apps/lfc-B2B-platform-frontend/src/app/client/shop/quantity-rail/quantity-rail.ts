import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

/** La densité du rail — elle suit la place, jamais le rôle. */
export type QuantityRailSize = 'sm' | 'lg';

/**
 * **Le réglage d'une quantité** — « − n + », partout où l'on en règle une.
 *
 * Il existait en DEUX exemplaires, dans la vignette et dans la fiche : même
 * balisage, mêmes couleurs, deux tailles. Deux endroits où l'on peut oublier de
 * désactiver le retrait à zéro, ou changer une couleur.
 *
 * ⚠️ **La ligne de panier ne l'emploie pas**, et ce n'est pas un oubli : on y
 * corrige une quantité au lieu d'en ajouter une, donc elle prend le champ
 * `fold-number-input` — qui se tape, et que le panier du back-office emploie
 * déjà. Le rail reste le geste du RAYON.
 *
 * 🔴 **Il est celui de la BOUTIQUE, pas un composant partagé de plus.**
 * `@lfd/b2b-ui` porte déjà `lfd-cart-row`, qui règle une quantité pour le
 * back-office : autre registre — casse normale, vignette, stepper de 7 rem. Lui
 * faire porter celui d'ici aurait demandé onze variables de peinture, et un
 * composant qui a besoin de onze variables pour ressembler à deux choses en est
 * deux. Ce qui ne doit pas diverger — l'arrondi au total de ligne, « zéro
 * retire » — est partagé ailleurs : `@lfd/money` et `ClientCart`.
 *
 * Le client retrouve donc au panier le contrôle exact qu'il vient d'utiliser au
 * rayon.
 */
@Component({
  selector: 'app-quantity-rail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './quantity-rail.html',
  styleUrl: './quantity-rail.scss',
  host: {
    '[class.is-lg]': "size() === 'lg'",
  },
})
export class QuantityRail {
  readonly quantity = input.required<number>();

  /** `sm` la vignette, `lg` la fiche. */
  readonly size = input<QuantityRailSize>('sm');

  readonly addLabel = input.required<string>();
  readonly removeLabel = input.required<string>();

  readonly added = output<void>();
  readonly removed = output<void>();
}

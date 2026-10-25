import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { FulfillmentMethod, PackingAbandonedLine } from '@lfd/contracts';
import { FoldCalloutComponent } from 'fold-ng';

import { AbandonedRemainder } from '../../commandes/abandoned-remainder/abandoned-remainder';

/**
 * **Ce qui n'est pas dans le sac** — le reste abandonné d'un départ incomplet
 * décidé, dit au comptoir avant de tendre (Hugo, 2026-10-25).
 *
 * Les mots dépendent de l'acheminement : au retrait, « Commande incomplète —
 * ces articles ne sont pas dans le sac » (« départ » est un mot de livraison) ;
 * en livraison, « Départ incomplet. Ces articles ne partent pas ». Il informe
 * le vendeur ; prévenir le client est une décision du commerce (« Écrire au
 * client », E6d), et aucune phrase ici n'y invite.
 */
@Component({
  selector: 'app-missing-items',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AbandonedRemainder, FoldCalloutComponent],
  templateUrl: './missing-items.html',
  styleUrl: './missing-items.scss',
})
export class MissingItems {
  readonly lines = input.required<readonly PackingAbandonedLine[]>();
  readonly fulfillmentMethod = input.required<FulfillmentMethod>();

  protected readonly pickup = computed(() => this.fulfillmentMethod() === 'pickup');
}

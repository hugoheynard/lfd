import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import type { PackingSheet } from '@lfd/contracts';

import type { PackingStack } from '../../packing-board';
import { isListed } from '../container-board';
import { PackingContainerBoard } from '../packing-container-board/packing-container-board';
import { PackingContainers } from '../packing-containers/packing-containers';
import { PackingLine } from '../packing-line/packing-line';

/**
 * **La commande ouverte au poste** — la colonne du milieu : la bande, les
 * contenants, les lignes et « Déclarer prête » — ou « Rouvrir » une fois prête.
 *
 * 🔴 **Un composant de présentation** : aucun service, aucun appel, aucun
 * calcul. Les chiffres (`packedLines`, `lineCount`, `remainingLines`,
 * `containers`) et la règle (`canDeclareReady`) viennent du serveur par la
 * commande ; l'orchestrateur `Colisage` y ajoute ce que lui seul sait — ce qui
 * est en vol. Le composant émet deux gestes, et c'est `Colisage` qui les écrit
 * puis relit. Découpé du poste le 2026-09-14.
 *
 * 🔴 **Une commande `counted` est en lecture seule** (`colisage.md`
 * §17.6) : colisée avec l'ancien poste, elle ne se modifie plus ici — ni coche,
 * ni compte, ni bac, ni « Prête », ni « Rouvrir ». Un court message le dit. Les
 * commandes `listed` tiennent leurs contenants dans la colonne (K2b).
 *
 * ⚠️ « Prête » à l'écran, `packed` dans le code : le serveur publie
 * `OrderPackedEvent` (« colisé »), le commerce en tire `ready`. Voir `Colisage`.
 */
@Component({
  selector: 'app-packing-open-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    PackingContainerBoard,
    PackingContainers,
    PackingLine,
  ],
  templateUrl: './packing-open-order.html',
  styleUrl: './packing-open-order.scss',
  host: { '[class.is-searching]': 'searching()' },
})
export class PackingOpenOrder {
  /** La commande ouverte, telle que servie. `null` = la pile affichée est vide. */
  readonly sheet = input<PackingSheet | null>(null);

  /** La pile affichée — elle dit lequel des deux vides montrer. */
  readonly stack = input<PackingStack>('todo');

  /** Les SKU que la recherche surligne. */
  readonly hitSkus = input<ReadonlySet<string>>(new Set());

  /** Le reste de la journée par SKU, tel que servi — remis au plateau. */
  readonly stock = input<ReadonlyMap<string, number>>(new Map());

  /** Une recherche est-elle en cours ? Elle met en retrait ce qu'elle ne touche pas. */
  readonly searching = input(false);

  /** Une déclaration en vol, relecture comprise. */
  readonly closing = input(false);

  /** Une réouverture en vol. */
  readonly reopening = input(false);

  /** « Déclarer prête pour le retrait » / « … pour la livraison ». */
  readonly readyLabel = input('Déclarer prête');

  /** « Déclarer prête » demandé. */
  readonly declareReady = output<void>();

  /** « Rouvrir » demandé — le rangement seulement, la commande reste prête. */
  readonly reopen = output<void>();

  /**
   * La commande tient-elle ses contenants dans la colonne (K2b) ? Sinon, elle
   * a été colisée avec l'ancien poste : lecture seule (§17.6).
   */
  protected readonly listed = computed(() => {
    const order = this.sheet();
    return order !== null && isListed(order);
  });
}

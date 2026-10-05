import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import type { PackingSheet } from '@lfd/contracts';

import type { PackingStack } from '../../packing-board';
import { PackingBinRow } from '../packing-bin-row/packing-bin-row';
import { PackingBins } from '../packing-bins/packing-bins';
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
 * 🔴 **Depuis K3b, plus de coche ni de « + / − »** (`plan-domaine-colisage.md`
 * §17) : une commande `counted` s'affiche en lecture seule, elle n'est plus
 * colisable (§17.3). Les lignes se glissent dans les contenants (`listed`).
 *
 * Seule exception, et elle est un composant à part : {@link PackingBins} (lot 4
 * bis), qui déclare les bacs d'une livraison prête. Ce geste-là n'est pas du colisage
 * — il relève du bloc livraison et de son droit — et il n'y a rien que le poste
 * doive relire après lui.
 *
 * **Une livraison n'a plus de compte anonyme** (lot PC1, 2026-10-02) : la
 * rangée {@link PackingBinRow} — « + Bac M » déclare un bac de la livraison —
 * prend sa place, et ses avertissements (D3 : aucun bac, du froid sans bac
 * isotherme) se disent au premier appui sur « Prête ». Le second déclare :
 * un avertissement d'écran, jamais un refus. Le retrait garde son compte (D4).
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
    PackingBinRow,
    PackingBins,
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
   * La commande tient-elle ses contenants dans la colonne (K2b) ? Sinon,
   * l'écran d'avant, intact.
   */
  protected readonly listed = computed(() => {
    const order = this.sheet();
    return order !== null && isListed(order);
  });

  /** La rangée « + format » de la livraison ouverte, quand elle est rendue. */
  private readonly binRow = viewChild(PackingBinRow);

  /** Les avertissements de D3 de la livraison ouverte — vides pour un retrait. */
  protected readonly binWarnings = computed(() => this.binRow()?.warnings() ?? []);

  /** La référence dont on a montré les avertissements : le prochain appui déclare. */
  private readonly warned = signal<string | null>(null);

  /** Les avertissements sont-ils à l'écran pour la commande ouverte ? */
  protected readonly warning = computed(() => {
    const order = this.sheet();
    return order !== null && this.warned() === order.reference && this.binWarnings().length > 0;
  });

  /**
   * « Prête » : au premier appui, s'il y a de quoi avertir, on avertit ; au
   * second (« quand même »), on déclare. Jamais un refus (D3).
   */
  protected askReady(): void {
    const order = this.sheet();
    if (order === null) {
      return;
    }
    if (this.binWarnings().length > 0 && this.warned() !== order.reference) {
      this.warned.set(order.reference);
      return;
    }
    this.warned.set(null);
    this.declareReady.emit();
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldIconComponent } from 'fold-ng';

import type {
  PackingContainerStep,
  PackingLine as PackingLineView,
  PackingSheet,
} from '@lfd/contracts';

import type { PackingStack } from '../../packing-board';
import { PackingContainers } from '../packing-containers/packing-containers';
import { PackingLine } from '../packing-line/packing-line';

/** Une coche demandée : la ligne SERVIE, et le sens voulu. */
export interface PackingLineToggle {
  readonly line: PackingLineView;
  readonly packed: boolean;
}

/**
 * **La commande ouverte au poste** — la colonne du milieu : la bande, les
 * containers, les lignes cochables et « Déclarer prête ».
 *
 * 🔴 **Un composant de présentation** : aucun service, aucun appel, aucun
 * calcul. Les chiffres (`packedLines`, `lineCount`, `remainingLines`,
 * `containers`) et la règle (`canDeclareReady`) viennent du serveur par la
 * commande ; l'orchestrateur `Colisage` y ajoute ce que lui seul sait — ce qui
 * est en vol. Le composant émet trois gestes, et c'est `Colisage` qui les écrit
 * puis relit. Découpé du poste le 2026-09-14.
 *
 * ⚠️ « Prête » à l'écran, `packed` dans le code : le serveur publie
 * `OrderPackedEvent` (« colisé »), le commerce en tire `ready`. Voir `Colisage`.
 */
@Component({
  selector: 'app-packing-open-order',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
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

  /**
   * L'état montré des cases dont l'envoi est en cours, par SKU — la seule chose
   * que l'écran garde. Un booléen : sans lui, un `fold-checkbox` cliqué ne
   * reviendrait pas en arrière sur un refus.
   */
  readonly shownPacked = input<ReadonlyMap<string, boolean>>(new Map());

  /** Les SKU dont la coche est en vol : leur case est désarmée. */
  readonly busySkus = input<ReadonlySet<string>>(new Set());

  /** Les SKU que la recherche surligne. */
  readonly hitSkus = input<ReadonlySet<string>>(new Set());

  /** Une recherche est-elle en cours ? Elle met en retrait ce qu'elle ne touche pas. */
  readonly searching = input(false);

  /** « + » et « − » s'offrent-ils ? */
  readonly canSetContainers = input(false);

  /** Un geste sur les containers en vol. */
  readonly containersBusy = input(false);

  /** Une déclaration en vol, relecture comprise. */
  readonly closing = input(false);

  /** « Déclarer prête pour le retrait » / « … pour la livraison ». */
  readonly readyLabel = input('Déclarer prête');

  /** Une coche demandée. */
  readonly toggled = output<PackingLineToggle>();

  /** Un sens de container demandé. */
  readonly containerStep = output<PackingContainerStep>();

  /** « Déclarer prête » demandé. */
  readonly declareReady = output<void>();

  /**
   * La ligne telle que la case doit l'afficher : servie, sauf l'état de la case
   * le temps de son envoi. Seul `packed` est recouvert — ni les initiales, ni la
   * quantité, ni aucun chiffre.
   */
  protected shownLine(line: PackingLineView): PackingLineView {
    const shown = this.shownPacked().get(line.sku);
    return shown === undefined ? line : { ...line, packed: shown };
  }
}

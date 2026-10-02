import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldIconComponent,
  FoldViewToggleComponent,
  type FoldViewToggleOption,
} from 'fold-ng';

import type { DeliveryPackingRoundView, PackingLine, PackingSheet } from '@lfd/contracts';

import { methodLabel, type PackingStack } from '../../packing-board';
import {
  type PackingGroup,
  packingGroups,
  packingRoundTitle,
  readyOrdersLabel,
} from '../packing-rounds';

/**
 * **La liste des commandes du poste** — la colonne de gauche : la bande, le
 * sélecteur « En cours » / « Prêtes », et la pile affichée.
 *
 * 🔴 **Un composant de présentation**, et rien de plus : aucun service, aucun
 * appel, aucun calcul. Il reçoit ce que le serveur a compté (`orderCount`,
 * `todoCount`, `readyCount`, le volume de chaque commande) et ce que
 * l'orchestrateur a décidé (la pile, la commande ouverte, les lignes trouvées),
 * et il émet deux gestes. Découpé du poste le 2026-09-14 : l'état, les lectures
 * et les écritures restent dans `Colisage`.
 *
 * **Rangée par tournée** (lot PC2, 2026-10-02) : chaque tournée du jour en
 * tête de groupe, « n commandes prêtes sur m » (compté par la livraison), ses
 * commandes du dernier arrêt au premier ; « Retenue au contrôle » (fournil) et
 * « À refaire » (livraison) sur la commande. Un ordre d'affichage : rien
 * n'est imposé.
 *
 * ⚠️ Le sélecteur FILTRE — la liste ne montre que la pile choisie —, là où la
 * recherche SURLIGNE. Les deux cohabitent : choisir une pile n'est pas cacher un
 * résultat, c'est ranger son travail.
 */
@Component({
  selector: 'app-packing-orders',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldIconComponent, FoldViewToggleComponent],
  templateUrl: './packing-orders.html',
  styleUrl: './packing-orders.scss',
  host: {
    // La recherche met en RETRAIT ce qu'elle ne touche pas. Posé sur l'hôte : la
    // règle vit dans la feuille de ce composant, qui est la seule à atteindre ses
    // propres commandes.
    '[class.is-searching]': 'searching()',
  },
})
export class PackingOrders {
  /** Les commandes de la PILE AFFICHÉE, telles que servies. */
  readonly sheets = input.required<readonly PackingSheet[]>();

  /** La pile choisie. */
  readonly stack = input.required<PackingStack>();

  /** Toutes les commandes de la journée — compté au serveur. */
  readonly orderCount = input.required<number>();

  /** La pile « En cours » — compté au serveur. */
  readonly todoCount = input.required<number>();

  /** La pile « Prêtes » — compté au serveur. */
  readonly readyCount = input.required<number>();

  /** La référence de la commande ouverte, `null` s'il n'y en a pas. */
  readonly openReference = input<string | null>(null);

  /**
   * Les lignes trouvées par la recherche, par référence de commande. Une
   * commande absente de la table n'a rien de trouvé ; une commande présente est
   * surlignée, et ses lignes s'affichent une à une, JAMAIS additionnées.
   */
  readonly hitLines = input<ReadonlyMap<string, readonly PackingLine[]>>(new Map());

  /** Une recherche est-elle en cours ? Elle met en retrait ce qu'elle ne touche pas. */
  readonly searching = input(false);

  /** Les tournées du jour, servies par la livraison — `[]` : aucun groupe de tournée. */
  readonly rounds = input<readonly DeliveryPackingRoundView[]>([]);

  /** Les groupes affichés — la pile, rangée dans l'ordre des tournées. */
  protected readonly groups = computed<readonly PackingGroup[]>(() =>
    packingGroups(this.sheets(), this.rounds()),
  );

  /** Y a-t-il au moins une tournée à l'écran ? Sinon, aucun en-tête de groupe. */
  protected readonly grouped = computed(() => this.groups().some((group) => group.round !== null));

  protected readonly roundTitle = packingRoundTitle;
  protected readonly readyLabel = readyOrdersLabel;

  /** La commande qu'on veut ouvrir. */
  readonly chosen = output<string>();

  /** La pile qu'on veut voir. */
  readonly stackChosen = output<PackingStack>();

  /** Les deux segments du sélecteur, chacun avec le compte que le serveur a fait. */
  protected readonly tabs = computed<readonly FoldViewToggleOption[]>(() => [
    { value: 'todo', label: `En cours ${this.todoCount()}` },
    { value: 'ready', label: `Prêtes ${this.readyCount()}` },
  ]);

  protected method(sheet: PackingSheet): string {
    return methodLabel(sheet.fulfillmentMethod);
  }

  /** `fold-view-toggle` parle en chaîne ; la pile, elle, est fermée. */
  protected chooseStack(value: string): void {
    this.stackChosen.emit(value === 'ready' ? 'ready' : 'todo');
  }
}

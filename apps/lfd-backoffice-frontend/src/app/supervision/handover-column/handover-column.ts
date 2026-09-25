import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { FulfillmentMethod } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import type { HandoverBoard, SlotGroup, SlotRow } from '../handover-slots';
import { countLabel } from '../supervision-labels';
import { SUPERVISION_LINKS } from '../supervision-links';

/**
 * **Colonne 3 · Retrait / livraison — l'unité est le créneau.** Deux métiers,
 * séparés par un segmenté (posé par la page dans l'en-tête fixe) ; chacun groupé par tranche horaire.
 *
 * Ni Remettre, ni Scanner, ni Appeler (plan §1) : une commande prête renvoie
 * vers le retrait, qui opère. La tournée de la maquette n'a pas de donnée
 * (plan §7) : l'onglet Livraison liste les commandes par créneau, sans ordre
 * de route.
 */
@Component({
  selector: 'app-handover-column',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './handover-column.html',
  styleUrl: './handover-column.scss',
})
export class HandoverColumn {
  readonly board = input.required<HandoverBoard>();
  readonly showLinks = input(false);
  readonly narrow = input(false);
  /** `supervision/day` a échoué : la file reste, mais aucun retard n'est jugé. */
  readonly latenessUnknown = input(false);

  protected readonly link = SUPERVISION_LINKS.handover;
  /** L'acheminement lu — choisi par le segmenté, que la page pose dans l'en-tête FIXE de la colonne. */
  readonly method = input<FulfillmentMethod>('pickup');

  protected readonly groups = computed<readonly SlotGroup[]>(() =>
    this.method() === 'pickup' ? this.board().pickup : this.board().delivery,
  );

  protected groupCount(group: SlotGroup): string {
    const expected = countLabel(group.expected, 'attendue', 'attendues');
    if (group.handedOver === 0) {
      return expected;
    }
    const done = this.method() === 'pickup' ? ['retirée', 'retirées'] : ['livrée', 'livrées'];
    return `${expected} · ${countLabel(group.handedOver, done[0] ?? '', done[1] ?? '')}`;
  }

  protected subLine(row: SlotRow): string {
    const units = countLabel(row.totalUnits, 'pièce', 'pièces');
    switch (row.state) {
      case 'handed_over': {
        const verb = row.method === 'pickup' ? 'Retirée' : 'Livrée';
        return row.handedOverAt === null ? verb : `${verb} à ${row.handedOverAt}`;
      }
      case 'cancelled':
        return 'Annulée';
      case 'overdue':
        return row.overdueMinutes === null
          ? 'créneau dépassé'
          : `créneau dépassé de ${String(row.overdueMinutes)} min`;
      case 'not_ready':
        return `${units} · encore au colisage`;
      case 'ready':
        return row.pickupLabel === null ? `${units} · prête` : `${units} · ${row.pickupLabel}`;
    }
  }

  /** Le renvoi remplace « Remettre » : seulement là où la maquette le posait, au retrait. */
  protected linksTo(row: SlotRow): boolean {
    return (
      this.showLinks() &&
      row.method === 'pickup' &&
      (row.state === 'ready' || row.state === 'overdue')
    );
  }
}

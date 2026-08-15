import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FoldEmptyStateComponent } from 'fold-ng';
import type { AdminOrderRow } from '@lfd/contracts';
import { OrderRow } from '@lfd/b2b-ui/order';

/**
 * **Ce que ce client a déjà commandé** — le volet gauche de l'onglet « Ses
 * commandes ».
 *
 * Une liste faite pour être **cliquée**, pas lue : choisir une commande remplit
 * le volet d'à côté de ses lignes et de leurs quantités. C'est le geste central
 * de l'écran — « refais-moi la même que mardi » est la phrase la plus fréquente
 * au téléphone.
 *
 * Elle a tenu une colonne à part, et c'était une colonne de trop : sur deux
 * sources d'articles sur trois, elle occupait un tiers de l'écran sans rien
 * dire. Repliée dans son onglet, elle ne prend de place que quand on la
 * regarde.
 */
@Component({
  selector: 'app-historique-commandes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent, OrderRow],
  templateUrl: './historique-commandes.html',
  styleUrl: './historique-commandes.scss',
})
export class HistoriqueCommandes {
  readonly orders = input.required<readonly AdminOrderRow[]>();
  readonly selectedId = input<string | null>(null);

  readonly select = output<string>();
}

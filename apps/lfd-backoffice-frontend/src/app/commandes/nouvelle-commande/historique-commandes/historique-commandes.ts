import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { FoldEmptyStateComponent, FoldPaginatorComponent } from 'fold-ng';
import type { AdminOrderRow } from '@lfd/contracts';
import { OrderRow } from '@lfd/b2b-ui/order';

/**
 * Combien de commandes par page. Douze mois d'un client régulier en font une
 * trentaine ; les faire défiler toutes rendait le volet interminable au pouce.
 */
const PAGE_SIZE = 8;

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
  imports: [FoldEmptyStateComponent, FoldPaginatorComponent, OrderRow],
  templateUrl: './historique-commandes.html',
  styleUrl: './historique-commandes.scss',
})
export class HistoriqueCommandes {
  readonly orders = input.required<readonly AdminOrderRow[]>();
  readonly selectedId = input<string | null>(null);

  readonly select = output<string>();

  /**
   * La page courante. `linkedSignal` sur la liste : un compte dont l'historique
   * change (on vient d'y poser une commande) revient page 1 plutôt que de rester
   * sur une page qui n'existe peut-être plus.
   */
  protected readonly page = linkedSignal<readonly AdminOrderRow[], number>({
    source: this.orders,
    computation: () => 1,
  });

  protected readonly pageSize = PAGE_SIZE;

  protected readonly visible = computed(() => {
    const start = (this.page() - 1) * PAGE_SIZE;
    return this.orders().slice(start, start + PAGE_SIZE);
  });
}

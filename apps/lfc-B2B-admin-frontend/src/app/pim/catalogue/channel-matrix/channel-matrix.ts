import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';

import type { PointOfSaleView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
} from 'fold-ng';

import type { SalesChannels } from '../../data/models';
import { sellsAt, withCell } from '../../data/channels';
import { SalesContextStore } from '../sales-contexts/sales-context-store';

/**
 * L'atome de la décision « sur quels canaux se vend ce produit ».
 *
 * **Tout y est une donnée, et la grille est enfin carrée** : une ligne par
 * point de vente, une colonne par contexte de vente. Une case n'est cochable
 * que si ce point de vente OFFRE ce contexte — c'est `point_of_sale_context`
 * qui le dit, pas ce composant.
 *
 * ## Ce que cette forme a remplacé
 *
 * Les deux boutiques étaient des clés fixes (`b1`/`b2`) avec des libellés en
 * dur, dont l'un ne désignait aucun emplacement réel. Puis les lignes sont
 * devenues une donnée, mais pas les colonnes. Puis les colonnes aussi — sauf
 * que les contextes « sans lieu » gardaient une case à part, en pied de
 * grille : le B2B n'était plus nommé, mais il restait une FORME particulière.
 *
 * Il n'en a plus. La plateforme professionnelle est une ligne comme une autre,
 * qui n'offre qu'une colonne. Le pied de grille a disparu, et avec lui la
 * dernière question « ce contexte a-t-il besoin d'un lieu ? ».
 *
 * Purement présentationnel : il montre les canaux effectifs et émet la nouvelle
 * valeur ; l'hôte décide de la sémantique héritage/override, car elle dépend du
 * défaut de la gamme.
 */
@Component({
  selector: 'app-channel-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCheckboxComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldElementTitleComponent,
  ],
  templateUrl: './channel-matrix.html',
  styleUrl: './channel-matrix.scss',
})
export class ChannelMatrix {
  private readonly contexts = inject(SalesContextStore);

  readonly channels = input.required<SalesChannels>();
  /** Les points de vente à proposer — boutiques ET plateformes. */
  readonly pointsOfSale = input.required<readonly PointOfSaleView[]>();
  /**
   * Pourquoi la liste est vide, si elle l'est faute d'avoir pu la lire.
   * L'hôte le sait (il tient le store) ; la grille se contente de le dire.
   */
  readonly unreadable = input<string | null>(null);
  /** `true` = valeurs héritées de la gamme ; `false` = personnalisé. */
  readonly inherited = input<boolean>(true);
  /** Masque l'entête héritage/revert — au niveau gamme, la grille EST la source. */
  readonly showState = input<boolean>(true);

  readonly channelsChange = output<SalesChannels>();
  readonly revert = output<void>();

  /** Les colonnes : tous les contextes en service, sans distinction de forme. */
  protected readonly columns = computed(() => this.contexts.items());

  protected isOn(pointOfSaleId: string, contextKey: string): boolean {
    return sellsAt(this.channels(), pointOfSaleId, contextKey);
  }

  /**
   * Ce point de vente offre-t-il ce contexte ?
   *
   * Une case non offerte n'est pas décochée : elle **n'existe pas**. Vendre
   * « sur place » depuis une boutique sans salle produisait une fiche pour un
   * lieu qui ne sert pas — le serveur le refuse désormais, et la grille ne
   * propose donc plus le geste qui serait refusé.
   */
  protected offers(point: PointOfSaleView, contextKey: string): boolean {
    return point.contexts.includes(contextKey);
  }

  /**
   * Écrit une case. Une paire absente = rien n'y est vendu : décocher RETIRE la
   * ligne plutôt que de la garder à faux, sans quoi la matrice grossirait à
   * chaque case touchée — et bloquerait la suppression d'un point de vente que
   * plus personne ne vend.
   */
  protected setCell(pointOfSaleId: string, contextKey: string, sold: boolean): void {
    this.channelsChange.emit(withCell(this.channels(), pointOfSaleId, contextKey, sold));
  }
}

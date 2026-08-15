import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FoldPanelHeaderComponent, FoldPanelRef, type FoldPanelDefaults } from 'fold-ng';
import type {
  CompanyMemberView,
  DeliveryAddressView,
  DeliveryZoneView,
  PickupAddressView,
} from '@lfd/contracts';

import type { CartStore } from '../cart.store';
import type { DraftStore } from '../draft.store';
import { PanierCommande, type OrderDraft } from '../panier-commande/panier-commande';

/** Ce que la page confie au tiroir — les mêmes entrées que la colonne de droite. */
export interface PanierPanelData {
  readonly cart: CartStore;
  readonly draft: DraftStore;
  readonly companyName: string;
  readonly buyers: readonly CompanyMemberView[];
  readonly pickups: readonly PickupAddressView[];
  readonly addresses: readonly DeliveryAddressView[];
  readonly zones: readonly DeliveryZoneView[];
  readonly settlesOnAccount: boolean;
}

/**
 * Le panier **en tiroir**, pour les écrans étroits.
 *
 * En mobile, trois colonnes n'en font qu'une, et le panier poussait les sources
 * hors de l'écran : on saisissait à l'aveugle. Il se replie donc derrière une
 * barre qui dit ce qu'il contient, et s'ouvre en **bottom sheet** (`side: 'auto'`
 * s'en charge : tiroir latéral sur large, feuille par le bas sur étroit).
 *
 * **Non modal** : la page continue de défiler derrière, et un clic dehors ne
 * ferme pas — on ajoute un article, on rouvre, on continue. Ce qui a été réglé
 * survit à la fermeture parce que rien n'est gardé ici : le panier et le
 * brouillon sont des **stores** de la page, et ce panneau n'en est qu'une vue.
 *
 * Il ne passe pas la commande : il **ferme en rendant** le brouillon, et c'est la
 * page qui poste. Le tiroir disparaît alors sous le doigt qui vient de valider,
 * ce qui est exactement ce qu'on veut voir arriver.
 */
@Component({
  selector: 'app-panier-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelHeaderComponent, PanierCommande],
  templateUrl: './panier-panel.html',
  styleUrl: './panier-panel.scss',
})
export class PanierPanel {
  static readonly foldPanel: FoldPanelDefaults = {
    modal: false,
    surface: 'solid',
    // `auto` = tiroir latéral sur large, **feuille par le bas** sur étroit.
    side: 'auto',
  };

  readonly data = input.required<PanierPanelData>();

  private readonly ref = inject(FoldPanelRef<OrderDraft>);

  protected close(): void {
    this.ref.close();
  }

  protected onPlace(draft: OrderDraft): void {
    this.ref.close(draft);
  }
}

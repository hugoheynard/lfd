import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import {
  FoldPanelBodyComponent,
  type FoldPanelDefaults,
  FoldPanelHeaderComponent,
  FoldPanelHostService,
  FoldPanelRef,
} from 'fold-ng';

import { accueilPublicCopy } from '../../copy/screens/accueil-public.copy';
import { commandTermsCopy } from '../../copy/screens/command-terms.copy';
import { screenCopy } from '../../copy/shop-copy-composer';
import { dialogSide } from '../../panel-side';
import { ORDER_DIALOG } from '../order-dialog';
import { ServiceDoors } from '../service-doors/service-doors';

/** Ce que rend la question : le mode choisi. */
export type ServiceMode = 'pickup' | 'delivery';

/**
 * **« Retrait ou coursier ? »** — la question qui précède les deux portes,
 * quand rien n'est encore choisi.
 *
 * 🔴 Régression (Hugo, 2026-10-13, O6 de
 * `documentation/commandes/observations-flux-de-commande.md`) : un pro entré
 * directement par la boutique, sans passer par l'accueil, se voyait ouvrir
 * d'office « Où je la prends » au moment de régler — la livraison ne lui était
 * jamais proposée.
 *
 * Ce sont les deux portes de l'accueil (`ServiceDoors`), avec leurs textes :
 * une seconde forme du même arbitrage finirait par dire autre chose.
 *
 * ⚠️ Il ne s'ouvre que si le coursier est ouvert à la clientèle
 * (`OrderDoors.deliveryOpen`) — sinon il n'y a rien à arbitrer, et
 * `OrderDoors.choose` va droit au retrait. La porte du coursier y est donc
 * toujours `open`.
 */
@Component({
  selector: 'app-service-mode-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPanelBodyComponent, FoldPanelHeaderComponent, ServiceDoors],
  templateUrl: './service-mode-dialog.html',
})
export class ServiceModeDialog {
  static readonly foldPanel: FoldPanelDefaults = ORDER_DIALOG;

  /** Rend le mode choisi, ou `undefined` si l'on ferme — fermer n'est pas choisir. */
  static open(panels: FoldPanelHostService): FoldPanelRef<ServiceMode | undefined> {
    return panels.open<undefined, ServiceMode | undefined>(ServiceModeDialog, {
      side: dialogSide(),
      stack: true,
      data: undefined,
    });
  }

  /** Rien à recevoir : la question est la même pour tous. Le contrat du panneau l'attend. */
  readonly data = input<undefined>();

  private readonly ref = inject(FoldPanelRef);

  protected readonly c = screenCopy('commandTerms', commandTermsCopy);
  protected readonly doors = screenCopy('accueilPublic', accueilPublicCopy);

  protected choose(mode: ServiceMode): void {
    this.ref.close(mode);
  }
}

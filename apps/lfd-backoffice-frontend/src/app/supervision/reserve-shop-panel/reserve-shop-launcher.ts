import { computed, inject, Injectable } from '@angular/core';
import type { WithdrawnPackingSheet } from '@lfd/contracts';
import { FoldPanelHostService, type FoldPanelSide } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { RESERVE_SHOP_WRITE } from '../reserve-shop.service';
import { ReserveShopPanel, type ReserveShopPanelData } from './reserve-shop-panel';

/** Le panneau au bureau, à la largeur de celui du contrôle (Supervision v2, A9). */
const PANEL_WIDTH_PX = 460;

/**
 * **« Envoyer en boutique », depuis la Supervision** (plan A1, lot A1.4) — le
 * droit qui ouvre le bouton, et l'ouverture du panneau. Sorti de la page pour
 * la garder lisible.
 */
@Injectable({ providedIn: 'root' })
export class ReserveShopLauncher {
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);

  /** Lu à chaque rendu : un droit accordé en cours de session ouvre le bouton. */
  readonly canSend = computed(() => this.permissions.can(RESERVE_SHOP_WRITE));

  /** `true` si un envoi est parti — la page relit alors. */
  async open(
    serviceDay: string,
    sheet: WithdrawnPackingSheet,
    side: FoldPanelSide = 'right',
  ): Promise<boolean> {
    const closed = await this.panels.open<ReserveShopPanelData, boolean>(ReserveShopPanel, {
      data: { serviceDay, reference: sheet.reference, released: sheet.released },
      side,
      surface: 'solid',
      width: PANEL_WIDTH_PX,
    }).closed;
    return closed === true;
  }
}

import { inject, Injectable } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';

import {
  DriverNoticeDialog,
  type DriverNoticeDialogData,
} from './driver-notice-dialog/driver-notice-dialog';
import { DriverNoticeService } from './driver-notice.service';

/**
 * **Le texte d'information, avant le départ** (Hugo, 2026-10-06 : « un dialog
 * qui s'ouvre au moment de démarrer la tournée »).
 *
 * Relit à CHAQUE départ si la version courante est accusée : déjà lue, le
 * départ part tout de suite ; pas encore — première tournée, ou nouvelle
 * version du texte —, le dialogue s'ouvre. Rend `true` pour démarrer.
 * Un échec de lecture REJETTE : la page le dit, et ne démarre pas.
 */
@Injectable({ providedIn: 'root' })
export class DriverNoticeGate {
  private readonly api = inject(DriverNoticeService);
  private readonly panels = inject(FoldPanelHostService);

  async clear(): Promise<boolean> {
    const mine = await this.api.mine();
    if (mine.acknowledgedAt !== null) {
      return true;
    }
    const ref = this.panels.open<DriverNoticeDialogData, boolean>(DriverNoticeDialog, {
      data: { notice: mine.notice },
    });
    return (await ref.closed) === true;
  }
}

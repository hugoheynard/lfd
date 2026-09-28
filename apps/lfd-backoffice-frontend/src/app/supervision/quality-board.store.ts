import { computed, inject, Injectable, signal } from '@angular/core';
import type { QualityBoardView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';

import { PermissionsStore } from '../auth/permissions.store';
import { type ColumnState, dataOf, LOADING, readInto } from './column-state';
import { qualityLookup, type QualityRequest } from './quality-badges';
import { QualityPanel, type QualityPanelData } from './quality-panel/quality-panel';
import { QualityService } from './quality.service';

/** Le droit de juger (D3) : il ouvre le bouton « Contrôler » et le détail. */
export const QUALITY_WRITE = 'b2b_supervision:write';

/**
 * **Les pastilles du contrôle qualité, pour une page de Supervision.** Sorti de
 * la page pour la garder sous les 300 lignes : la lecture des pastilles, son
 * état, et l'ouverture du panneau de contrôle.
 *
 * Fourni PAR la page (`providers`), pas à la racine : son état est celui de la
 * journée affichée.
 */
@Injectable()
export class QualityBoardStore {
  private readonly service = inject(QualityService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);

  /** La journée dont on attend la réponse — une réponse d'une autre journée est jetée. */
  private asked: string | null = null;

  readonly state = signal<ColumnState<QualityBoardView>>(LOADING);
  readonly lookup = computed(() => qualityLookup(dataOf(this.state())));
  /** Les pastilles n'ont pas pu être lues : l'absence de pastille ne dit plus « pas contrôlé ». */
  readonly failed = computed(() => {
    const state = this.state();
    return state.status === 'error' || (state.status === 'ready' && state.stale);
  });

  /** Lu à chaque rendu : un droit accordé en cours de session ouvre le bouton. */
  readonly canCheck = computed(() => this.permissions.can(QUALITY_WRITE));

  /** Une relecture qui échoue garde les pastilles, et le dit. */
  read(date: string): Promise<void> {
    this.asked = date;
    return readInto(
      this.state,
      () => this.service.board(date),
      () => this.asked === date,
    );
  }

  /** Un autre jour : les pastilles d'hier ne se posent pas sur aujourd'hui. */
  reset(): void {
    this.state.set(LOADING);
  }

  /** Ouvre le panneau ; `true` si un verdict a été enregistré — la page relit alors. */
  async open(serviceDay: string, request: QualityRequest): Promise<boolean> {
    const closed = await this.panels.open<QualityPanelData, boolean>(QualityPanel, {
      data: { serviceDay, ...request },
      width: 'md',
    }).closed;
    return closed === true;
  }
}

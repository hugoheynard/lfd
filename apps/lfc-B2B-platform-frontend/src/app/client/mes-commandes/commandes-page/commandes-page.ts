import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FoldElementTitleComponent, FoldIconComponent, FoldPageSectionComponent } from 'fold-ng';

import { FoldScrollIndicatorComponent, FoldWellComponent } from '../../../../shared';

import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { NewOrderAction } from '../../nav/new-order-action/new-order-action';
import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import type { HistoryOrder } from '../../mock-orders';
import { MOCK_HISTORY, MOCK_TRACKED } from '../../mock-orders';
import { HistoryTable } from '../history-table/history-table';
import { ReportSheet } from '../report-sheet/report-sheet';
import { TrackCard } from '../track-card/track-card';

/**
 * `/mes-commandes` — le suivi, puis la mémoire.
 *
 * Deux registres, et l'ordre n'est pas négociable : ce qui est EN ROUTE d'abord,
 * ce qui est passé ensuite. On ouvre cet écran pour savoir où en est la commande
 * du matin ; l'historique est ce qu'on consulte, pas ce qu'on attend.
 *
 * Les suivis vivent dans un PUITS, et le puits a une raison d'être : le
 * défilement horizontal y annonce qu'il y a autre chose à droite. Sans lui, le
 * débordement passait pour un accident de mise en page — c'est le constat du
 * dossier de design, et il vaut aux deux tailles.
 *
 * ⚠️ La matière vient de [[mock-orders]]. Trois choses manquent au modèle réel
 * pour que cet écran vive vraiment : les horodatages d'étape, le bon de commande
 * PDF et le canal de réclamation. Elles sont écrites dans `09-mes-commandes.md`.
 */
@Component({
  selector: 'app-commandes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldElementTitleComponent,
    FoldIconComponent,
    FoldPageSectionComponent,
    FoldScrollIndicatorComponent,
    FoldWellComponent,
    HistoryTable,
    NewOrderAction,
    ReportSheet,
    TrackCard,
  ],
  templateUrl: './commandes-page.html',
  styleUrl: './commandes-page.scss',
})
export class CommandesPage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly chrome = inject(ClientChrome);

  protected readonly tracked = MOCK_TRACKED;
  protected readonly history = MOCK_HISTORY;

  /** La commande dont on signale un problème — `null` referme la feuille. */
  protected readonly reported = signal<HistoryOrder | null>(null);

  /**
   * Le sur-titre du bandeau : combien de commandes VIVENT en ce moment.
   *
   * Il double le compte du puits, et c'est voulu : celui-ci se lit AVANT
   * d'avoir descendu, sur le registre sombre — c'est la raison pour laquelle on
   * a ouvert l'écran, et elle ne doit pas attendre le premier défilement.
   */
  protected readonly liveCount = computed(() =>
    this.t().orders.liveCount.replace('{n}', String(this.tracked.length)),
  );

  protected readonly wellHint = computed(() =>
    this.t().orders.wellHint.replace('{n}', String(this.tracked.length)),
  );

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().nav.destinations.orders));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(null);
    this.chrome.barOnDesktop.set(true);
  }

  protected report(order: HistoryOrder): void {
    this.reported.set(order);
  }
}

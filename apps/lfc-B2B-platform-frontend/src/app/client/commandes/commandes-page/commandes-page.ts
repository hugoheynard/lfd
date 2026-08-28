import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import { ClientBannerOutlet } from '../../client-nav/client-banner';
import { ClientBannerBlock } from '../../client-nav/client-banner-block/client-banner-block';
import { NewOrderAction } from '../../client-nav/new-order-action/new-order-action';
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
    FoldIconComponent,
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

  private readonly rail = viewChild<ElementRef<HTMLDivElement>>('rail');

  /**
   * Le suivi au premier plan, d'après le défilement.
   *
   * Il est dérivé de la POSITION et non d'un clic : on fait glisser à la main
   * bien plus souvent qu'on ne vise un point, et un indicateur qui ne suivrait
   * que les clics mentirait dès le premier geste.
   */
  protected readonly at = signal(0);

  /** La commande dont on signale un problème — `null` referme la feuille. */
  protected readonly reported = signal<HistoryOrder | null>(null);

  /**
   * Le sur-titre du bandeau : combien de commandes VIVENT en ce moment.
   *
   * Il n'est pas le même que l'indice du puits, et c'est voulu : celui-ci
   * compte, celui-là explique qu'on peut faire glisser. Le premier se lit avant
   * même d'avoir descendu — c'est la raison pour laquelle on a ouvert l'écran.
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

  /** Le point actif suit la carte la plus proche du bord d'entrée. */
  protected onScroll(): void {
    const rail = this.rail()?.nativeElement;
    if (rail === undefined) {
      return;
    }
    const cards = Array.from(rail.children);
    const left = rail.scrollLeft;
    let best = 0;
    let distance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const gap = Math.abs((card as HTMLElement).offsetLeft - rail.offsetLeft - left);
      if (gap < distance) {
        distance = gap;
        best = index;
      }
    });
    this.at.set(best);
  }

  /** Un point est aussi une cible : le viser amène sa carte. */
  protected goTo(index: number): void {
    const card = this.rail()?.nativeElement.children[index];
    card?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  protected dotLabel(index: number): string {
    return this.t().orders.wellDot.replace('{n}', String(index + 1));
  }
}

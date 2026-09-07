import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FoldElementTitleComponent, FoldIconComponent, FoldPageSectionComponent } from 'fold-ng';

import { FoldScrollIndicatorComponent, FoldWellComponent } from '../../../../shared';

import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { NewOrderAction } from '../../nav/new-order-action/new-order-action';

import { ClientChrome } from '../../client-chrome.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientCompany } from '../../client-company.service';
import { ClientOrderHistory } from '../client-order-history.service';
import { OrderSheetService } from '../order-sheet.service';
import { downloadBlob } from '../download-blob';
import { historyRowOf, isLive, trackedOf, type HistoryOrder, type RowCopy } from '../order-rows';
import { HistoryTable } from '../history-table/history-table';
import { NotifyService } from '../../../notify.service';
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
 * 🔴 **La matière vient de notre base** (`GET /companies/:id/orders` et
 * `GET /orders/mine`). Elle venait d'un fichier de maquette : deux suivis et six
 * lignes écrits en dur, montrés à côté d'un panier qui, lui, partait vraiment au
 * serveur.
 *
 * ⚠️ Trois choses manquent encore au modèle pour que cet écran dise tout ce
 * qu'il voudrait : les **horodatages d'étape** (seules la passation et la remise
 * sont datées), le **bon de commande PDF** et le **canal de réclamation**. Elles
 * sont écrites dans `09-mes-commandes.md`. Ce qui manque est absent de l'écran,
 * pas remplacé.
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
  private readonly router = inject(Router);
  private readonly sheets = inject(OrderSheetService);
  private readonly notify = inject(NotifyService);

  private readonly history_ = inject(ClientOrderHistory);
  private readonly client = inject(ClientCompany);

  /** Les mots de l'écran, que les modèles de vue ne portent pas. */
  private readonly rowCopy = computed<RowCopy>(() => {
    const copy = this.t().orders;
    return {
      pickup: copy.modePickup,
      delivery: copy.modeDelivery,
      stepPlaced: copy.stepPlaced,
      stepBakery: copy.stepBakery,
      stepReady: copy.stepReady,
      stepHandedPickup: copy.stepHandedPickup,
      stepHandedDelivery: copy.stepHandedDelivery,
      qrReady: copy.qrReady,
      noWindow: copy.noWindow,
    };
  });

  /** Ce qui VIT : ni remis, ni annulé. Le suivi ne montre que celles-là. */
  protected readonly tracked = computed(() =>
    this.history_
      .orders()
      .filter((order) => isLive(order))
      .map((order) => trackedOf(order, this.rowCopy())),
  );

  protected readonly history = computed(() => {
    const org = this.client.name();
    return this.history_.orders().map((order) => historyRowOf(order, org, this.rowCopy()));
  });

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
    this.t().orders.liveCount.replace('{n}', String(this.tracked().length)),
  );

  protected readonly wellHint = computed(() =>
    this.t().orders.wellHint.replace('{n}', String(this.tracked().length)),
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

  /**
   * Le bon de commande, **demandé au serveur** puis proposé au téléchargement.
   *
   * 🔴 Le bouton du tiroir portait l'icône du téléchargement et n'avait aucun
   * `(click)` : il ne faisait rien, sans même le dire. Il rejoint `showQr`
   * ci-dessous dans la même famille de trou — un geste dessiné, jamais branché.
   *
   * Le fichier vient de l'API et non du navigateur, et ce n'est pas un détour :
   * le serveur ARCHIVE ce qu'il a servi la première fois, de sorte qu'un avenant
   * appliqué le lendemain ne réécrit pas le papier que le client a déjà. Un
   * rendu local refabriquerait à partir de ce que la commande dit aujourd'hui.
   */
  protected downloadSheet(order: HistoryOrder): void {
    // Le gabarit appelle une méthode SYNCHRONE : une liaison Angular n'attend
    // pas une promesse, et la lui rendre en laisserait une flotter sans que
    // personne n'attrape son échec.
    void this.fetchSheet(order);
  }

  private async fetchSheet(order: HistoryOrder): Promise<void> {
    try {
      const pdf = await this.sheets.pdfOf(order.id);
      // Le nom se compose sur la RÉFÉRENCE, celle que le client lit sur son
      // écran : c'est ce qu'il cherchera dans son dossier de téléchargements.
      downloadBlob(`bon-de-commande-${order.reference}.pdf`, pdf);
    } catch {
      this.notify.error(this.t().orders.purchaseOrderFailed);
    }
  }

  /**
   * Le QR de retrait de cette commande-là.
   *
   * 🔴 La carte de suivi émettait déjà `qrAsked`, et **rien ne l'écoutait** : le
   * bouton « Voir mon QR » du suivi ne faisait rien du tout, sans même le dire.
   * L'écran existe depuis le lot 4 ; il lui manquait son appelant.
   */
  protected showQr(orderId: string): void {
    void this.router.navigate(['/mes-commandes/retrait', orderId]);
  }
}

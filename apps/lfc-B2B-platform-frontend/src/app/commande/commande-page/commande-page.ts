import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FoldCalloutComponent } from 'fold-ng';

import { CallbackBlock } from '../../client/callback-block/callback-block';
import { ClientChrome } from '../../client/client-chrome.service';
import { ClientPage } from '../../client/client-page/client-page';
import { ClientCopyService, fill } from '../../client/copy/client-copy.service';
import { MOCK_CLIENT } from '../../client/mock-client';
import { RappelPanel } from '../../login/accueil-page/rappel-panel/rappel-panel';

import { ModeCard } from './mode-card/mode-card';
import { ShortcutRow } from './shortcut-row/shortcut-row';

/**
 * L'écran d'un client reconnu : UNE question, deux portes.
 *
 * Le mode de service passe AVANT le catalogue, et pas l'inverse : ce qui est en
 * stock, à quelle heure et à quel prix dépend d'où l'on est servi. Demander le
 * mode d'abord, c'est s'épargner un panier qu'il faudrait corriger après coup.
 *
 * Sous les deux portes, trois raccourcis qui ne sont pas des commandes neuves :
 * visiter sans choisir, retirer ce qui est prêt, refaire la dernière. Puis
 * l'encart de rappel, pour l'oubli qui ne rentre dans aucun des trois.
 *
 * ⚠️ Maquette : aucune des portes n'a encore son écran. Chacune le DIT, plutôt
 * que de ne rien faire.
 */
@Component({
  selector: 'app-commande-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CallbackBlock, ClientPage, FoldCalloutComponent, ModeCard, RappelPanel, ShortcutRow],
  templateUrl: './commande-page.html',
  styleUrl: './commande-page.scss',
})
export class CommandePage {
  private readonly chrome = inject(ClientChrome);

  protected readonly t = inject(ClientCopyService).t;

  protected readonly phone = MOCK_CLIENT.phone;

  protected readonly panelOpen = signal(false);
  protected readonly bookedSlot = signal<string | null>(null);

  /** La destination touchée dont l'écran n'existe pas encore. */
  protected readonly pending = signal(false);

  protected readonly heading = computed(() =>
    this.panelOpen()
      ? this.t().hero.rappelTitle
      : fill(this.t().commande.title, { name: MOCK_CLIENT.firstName }),
  );

  protected readonly intro = computed(() =>
    this.panelOpen() ? this.t().hero.rappelIntro : this.t().commande.intro,
  );

  protected readonly orderLine = computed(() =>
    fill(this.t().commande.qrSub, { order: MOCK_CLIENT.lastOrder }),
  );

  constructor() {
    effect(() => {
      this.chrome.kicker.set(
        this.panelOpen() ? this.t().chrome.kickerRappel : this.t().chrome.kickerCommande,
      );
      this.chrome.back.set(this.panelOpen() ? (): void => this.panelOpen.set(false) : null);
    });
    // Comme l'accueil : au-delà du pli, la marque remonte dans la colonne d'encre
    // de l'écran, et la barre du shell s'efface plutôt que de faire doublon.
    this.chrome.barOnDesktop.set(false);
  }

  /** ⚠️ Maquette : la porte est branchée, son écran arrive au prochain lot. */
  protected notYet(): void {
    this.pending.set(true);
  }

  protected openPanel(): void {
    this.pending.set(false);
    this.panelOpen.set(true);
  }

  protected book(slot: string): void {
    this.bookedSlot.set(slot);
    this.panelOpen.set(false);
  }
}

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

import { AddressDialog, type DeliveryChoice } from './address-dialog/address-dialog';
import { OfferCard } from './offer-card/offer-card';
import { OfferCarousel } from './offer-carousel/offer-carousel';
import { PickupDialog } from './pickup-dialog/pickup-dialog';
import { SectionPanel } from './section-panel/section-panel';
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
  imports: [
    AddressDialog,
    CallbackBlock,
    ClientPage,
    FoldCalloutComponent,
    PickupDialog,
    OfferCard,
    OfferCarousel,
    RappelPanel,
    SectionPanel,
    ShortcutRow,
  ],
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

  /** Le dialogue ouvert, s'il y en a un. Un seul à la fois, par construction. */
  protected readonly dialog = signal<'pickup' | 'address' | null>(null);

  /** Ce que le dialogue a retenu, montré en clair sous les deux portes. */
  protected readonly settled = signal<string | null>(null);

  protected readonly heading = computed(() =>
    this.panelOpen()
      ? this.t().hero.rappelTitle
      : fill(this.t().commande.title, { name: MOCK_CLIENT.firstName }),
  );

  protected readonly intro = computed(() =>
    this.panelOpen() ? this.t().hero.rappelIntro : this.t().commande.intro,
  );

  /** Les deux sections du carrousel, nommées pour les technologies d'assistance. */
  protected readonly sections = computed(() => [
    this.t().commande.newOrderTitle,
    this.t().commande.nowTitle,
  ]);

  constructor() {
    effect(() => {
      this.chrome.kicker.set(
        this.panelOpen() ? this.t().chrome.kickerRappel : this.t().chrome.kickerCommande,
      );
      this.chrome.back.set(this.panelOpen() ? (): void => this.panelOpen.set(false) : null);
    });
    // Contrairement à l'accueil, la barre RESTE au-delà du pli : le gabarit
    // `stacked` n'a pas de colonne d'encre où loger la marque, et la réf montre
    // bien une barre d'app en haut de l'écran de bureau.
    this.chrome.barOnDesktop.set(true);
    // Ici on est reconnu : la pastille de marque cède la place au menu, qui mène
    // à ses affaires. ⚠️ Maquette — le menu n'a pas encore d'écran.
    this.chrome.menu.set((): void => this.notYet());
    this.chrome.bell.set((): void => this.notYet());
    this.chrome.bellCount.set(MOCK_CLIENT.unread);
  }

  /** ⚠️ Maquette : la porte est branchée, son écran arrive au prochain lot. */
  protected notYet(): void {
    this.pending.set(true);
  }

  protected openDialog(which: 'pickup' | 'address'): void {
    this.pending.set(false);
    this.settled.set(null);
    this.dialog.set(which);
  }

  /**
   * ⚠️ Maquette : la suite du parcours (la boutique, puis le panier) n'existe
   * pas encore. On retient donc le choix à l'écran plutôt que d'y mener.
   */
  protected settlePickup(name: string): void {
    this.settled.set(name);
    this.dialog.set(null);
  }

  protected settleDelivery(choice: DeliveryChoice): void {
    this.settled.set(`${choice.line} · ${choice.zone.fee} €`);
    this.dialog.set(null);
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

import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { formatCents, formatRate } from '../../../client/format-money';
import { ClientChrome } from '../../../client/client-chrome.service';
import { ClientOrders } from '../../../client/client-orders.service';
import { ClientCopyService, fill } from '../../../client/copy/client-copy.service';

/**
 * La commande passée.
 *
 * 🔴 **Elle annonçait cinq choses que le système ne faisait pas** : « c'est
 * réglé » sans qu'aucun paiement n'ait lieu, un reçu par e-mail qui n'existe
 * pas, une facture qui n'existe pas, un QR derrière un bouton mort, et une
 * modification jusqu'à 22 h qu'aucune route ne sait faire.
 *
 * Il en reste **zéro**. Le règlement est une étape réelle et l'écran en dit
 * l'état exact ; le QR a son écran ; le reçu et la facture ont cédé la place à
 * ce qui est vrai — la commande est gardée, et voilà où ; les deux boutons de
 * modification sont partis avec la phrase qui promettait un remboursement.
 *
 * Un écran de confirmation est le seul que **tout le monde** lit. Une phrase
 * fausse y coûte un appel au service client ; cinq en coûtaient cinq.
 */
@Component({
  selector: 'app-confirmation-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './confirmation-page.html',
  styleUrl: './confirmation-page.scss',
})
export class ConfirmationPage {
  private readonly chrome = inject(ClientChrome);
  private readonly router = inject(Router);
  private readonly orders = inject(ClientOrders);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly order = this.orders.latest;

  /**
   * Le titre dépend de ce que la commande DOIT encore.
   *
   * 🔴 Il annonçait « c'est réglé » dans tous les cas, y compris pour une
   * commande qui venait de partir en `pending` derrière une intention Stripe que
   * personne n'avait présentée. Trois états, trois phrases : ce qui est payé le
   * dit, ce qui reste dû le dit aussi, et ce qui part au compte ne réclame rien.
   */
  private readonly title = computed(() => {
    const done = this.t().done;
    switch (this.order()?.settlement) {
      case 'paid':
        return done.title;
      case 'due':
        return done.titleDue;
      default:
        return done.titleAccount;
    }
  });

  /** Le titre tient sur deux lignes dans le dictionnaire : elles sont voulues. */
  protected readonly titleLines = computed(() => this.title().split('\n'));

  /** Le libellé de la ligne de total — il nomme l'état, il ne l'invente pas. */
  protected readonly totalLabel = computed(() => {
    const done = this.t().done;
    switch (this.order()?.settlement) {
      case 'paid':
        return done.paidOnline;
      case 'due':
        return done.toSettle;
      default:
        return done.onAccount;
    }
  });

  /** Une commande encore due porte un chemin de retour vers le règlement. */
  protected readonly settlementDue = computed(() => this.order()?.settlement === 'due');

  /**
   * 🔴 **Le code existe pour les DEUX acheminements depuis le 2026-09-07.**
   *
   * Ce calcul disait « le comptoir n'existe qu'en retrait : c'est lui qui ouvre
   * le droit au code ». C'était vrai tant que le jeton n'était émis qu'en
   * retrait ; une livraison n'avait alors aucun chemin vers `fulfilled` et
   * restait « en cours » pour toujours. Le destinataire montre désormais le même
   * code, et c'est le coursier qui le scanne.
   *
   * Il ne reste donc plus de condition : toute commande passée a son code.
   */
  protected readonly hasCode = computed(() => this.order() !== null);

  protected readonly piecesLabel = computed(() =>
    fill(this.t().done.recapPieces, { count: String(this.order()?.pieces ?? 0) }),
  );

  /**
   * La remise **figée avec la commande**, telle que le serveur l'avait dite.
   *
   * Elle se lisait sur le choix de service, qui portait un pourcentage de
   * maquette ; elle vient désormais du décompte gelé — donc du même ajustement
   * que la facture, et sous la forme qu'il avait, taux ou montant.
   */
  protected readonly discountLabel = computed(() => {
    const order = this.order();
    const adjustment = order?.totals.discountAdjustment ?? null;
    if (!order || adjustment === null || order.totals.discountCents === 0) {
      return null;
    }
    const value =
      adjustment.mode === 'percent'
        ? formatRate(adjustment.bp / 100)
        : formatCents(adjustment.cents);
    return fill(this.t().cart.discount, { at: order.service.at, value });
  });

  protected readonly vatLines = computed(() => {
    const c = this.t().cart;
    return (this.order()?.totals.vat ?? []).map((share) => ({
      label: fill(c.vat, { rate: formatRate(share.rate) }),
      amount: formatCents(share.amountCents),
    }));
  });

  constructor() {
    this.chrome.kicker.set(this.t().chrome.kickerDone);
    this.chrome.back.set(null);
    effect(() => {
      // Rien à confirmer : personne n'est passé par le paiement. On renvoie au
      // rayon plutôt que d'afficher une commande vide.
      if (this.orders.latest() === null) {
        void this.router.navigate(['/nouvelle-commande']);
      }
    });
  }

  /** Les totaux figés arrivent en centimes ; le gabarit ne voit que des libellés. */
  protected money(cents: number): string {
    return formatCents(cents);
  }

  /** Le code de remise, pour les deux acheminements — cf. {@link hasCode}. */
  protected showQr(): void {
    const order = this.order();
    if (order !== null) {
      void this.router.navigate(['/mes-commandes/retrait', order.id]);
    }
  }

  /** Retour à l'étape de règlement, pour la commande qu'on est en train de lire. */
  protected settle(): void {
    const order = this.order();
    if (order !== null) {
      void this.router.navigate(['/nouvelle-commande/reglement', order.id]);
    }
  }

  protected backToShop(): void {
    void this.router.navigate(['/nouvelle-commande/boutique']);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FoldIconComponent } from 'fold-ng';

import { formatEuro, formatRate } from '../../client/cart-total';
import { ClientChrome } from '../../client/client-chrome.service';
import { ClientOrders } from '../../client/client-orders.service';
import { ClientCopyService, fill } from '../../client/copy/client-copy.service';
import { ClientIdentity } from '../../client/client-identity.service';
import { VAT_SALE } from '../../client/mock-shop';

/**
 * La commande passée.
 *
 * Trois choses y sont dites que personne n'aime écrire, et c'est pour ça
 * qu'elles y sont : à quelle ADRESSE le reçu part (pour qu'on la corrige si elle
 * est fausse), ce qui a été RÉGLÉ (en ligne, rien à payer au comptoir), et
 * jusqu'à quand on peut ANNULER — avec la raison de la date limite. Une échéance
 * qui dit pourquoi elle existe se conteste moins qu'une échéance nue.
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
  private readonly identity = inject(ClientIdentity);

  protected readonly t = inject(ClientCopyService).t;
  protected readonly order = this.orders.latest;

  /** ⚠️ Maquette : le QR et la modification n'ont pas encore leur écran. */
  protected readonly pending = signal(false);

  /** Le titre tient sur deux lignes dans le dictionnaire : elles sont voulues. */
  protected readonly titleLines = computed(() => this.t().done.title.split('\n'));

  /** L'adresse est NOMMÉE quand on la connaît, désignée quand on ne la sait pas. */
  protected readonly mailLine = computed(() => {
    const email = this.identity.email();
    return email === null
      ? this.t().done.mailLineNoAddress
      : fill(this.t().done.mailLine, { email });
  });

  protected readonly piecesLabel = computed(() =>
    fill(this.t().done.recapPieces, { count: String(this.order()?.pieces ?? 0) }),
  );

  protected readonly discountLabel = computed(() => {
    const service = this.order()?.service;
    if (!service || service.discount === 0) {
      return null;
    }
    return fill(this.t().cart.discount, { at: service.at, pct: String(service.discount) });
  });

  protected readonly vatLines = computed(() => {
    const c = this.t().cart;
    return (this.order()?.totals.vat ?? []).map((share) => ({
      label: fill(c.vat, { rate: formatRate(share.rate) }),
      scope: share.rate === VAT_SALE ? c.vatSale : c.vatSweet,
      amount: formatEuro(share.amount),
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

  protected money(value: number): string {
    return formatEuro(value);
  }

  protected notYet(): void {
    this.pending.set(true);
  }

  protected backToShop(): void {
    void this.router.navigate(['/nouvelle-commande/boutique']);
  }
}

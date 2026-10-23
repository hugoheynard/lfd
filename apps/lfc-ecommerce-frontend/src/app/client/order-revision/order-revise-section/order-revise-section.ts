import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderRevisability } from '@lfd/contracts/shop-values';
import { FoldButtonComponent } from 'fold-ng';

import { ClientLocale } from '../../client-locale.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { OrderRevisionGateway } from '../order-revision.gateway';
import { reviseOfferOf, type ReviseOffer } from '../revision-wording';

/**
 * **« Modifier ma commande » dans le tiroir** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M3, §6), à côté de
 * l'annulation et sous la même forme. Un lien : il mène à une page, qui
 * survit à un rechargement.
 *
 * Le serveur dit si la commande se modifie (`revisability` de
 * `GET /orders/:id`, la règle du geste : carte, heure limite, fournil,
 * comptabilité) ; le tiroir le relit à son ouverture, comme l'annulation.
 * Une indication, pas une promesse : le devis relit tout. Une lecture échouée
 * ne montre rien — l'annulation, juste dessous, dit déjà l'échec.
 */
@Component({
  selector: 'app-order-revise-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, RouterLink],
  templateUrl: './order-revise-section.html',
  styleUrl: './order-revise-section.scss',
})
export class OrderReviseSection implements OnInit {
  readonly orderId = input.required<string>();

  private readonly gateway = inject(OrderRevisionGateway);
  private readonly copy = inject(ClientCopyService);
  private readonly locale = inject(ClientLocale).current;

  protected readonly c = computed(() => this.copy.t().orders.revision);
  private readonly revisability = signal<OrderRevisability | null>(null);

  protected readonly offer = computed<ReviseOffer>(() => {
    const revisability = this.revisability();
    return revisability === null
      ? { kind: 'none' }
      : reviseOfferOf(revisability, this.locale(), this.c());
  });

  protected readonly untilSaid = computed(() => {
    const offer = this.offer();
    return offer.kind === 'revise' ? offer.until : null;
  });

  protected readonly refusalSaid = computed(() => {
    const offer = this.offer();
    return offer.kind === 'refused' ? offer.sentence : '';
  });

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    const detail = await this.gateway.order(this.orderId());
    this.revisability.set(detail?.revisability ?? null);
  }
}

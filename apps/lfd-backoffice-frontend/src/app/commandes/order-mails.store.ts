import { inject, Injectable, signal } from '@angular/core';
import type { OrderMailView } from '@lfd/contracts';

import { AdminOrdersService } from './orders.service';

export type OrderMailsState = 'loading' | 'ready' | 'error';

/**
 * **Les e-mails de la commande ouverte** (`le-sujet-des-e-mails.md`,
 * règles 7 et 8) — une lecture par fiche, partagée par la carte « E-mails »
 * et par la lettre de manque, qui y lit l'état réel de son e-mail.
 *
 * Fourni par la vue de la commande, pas à la racine : il vit et meurt avec
 * la fiche ouverte. `ensure` ne relit pas ce qui est déjà lu ou en cours ;
 * seuls « Réessayer » et un e-mail qu'on vient de demander relisent.
 */
@Injectable()
export class OrderMailsStore {
  private readonly api = inject(AdminOrdersService);

  readonly state = signal<OrderMailsState>('loading');
  readonly items = signal<readonly OrderMailView[]>([]);

  private orderId: string | null = null;
  /** Écarte la réponse d'une lecture dépassée par une autre commande. */
  private generation = 0;

  /** Lit une fois les e-mails de cette commande. */
  ensure(orderId: string): void {
    if (this.orderId === orderId) {
      return;
    }
    void this.reload(orderId);
  }

  /** Relit, pour la commande donnée ou celle déjà lue. */
  async reload(orderId: string | null = this.orderId): Promise<void> {
    if (orderId === null) {
      return;
    }
    this.orderId = orderId;
    const generation = ++this.generation;
    this.state.set('loading');
    try {
      const view = await this.api.mails(orderId);
      if (generation !== this.generation) return;
      this.items.set(view.items);
      this.state.set('ready');
    } catch {
      if (generation !== this.generation) return;
      this.state.set('error');
    }
  }

  /** Le plus récent e-mail de ce modèle — la liste est servie du plus récent au plus ancien. */
  latest(template: string): OrderMailView | null {
    return this.items().find((mail) => mail.template === template) ?? null;
  }
}

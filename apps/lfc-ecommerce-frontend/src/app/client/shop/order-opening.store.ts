import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
// Valeurs par le sous-chemin sans zod : le panier est au démarrage (budget `cloudflare`).
import {
  DEFAULT_ORDER_OPENING,
  ordersOpenTo,
  type PublicOrderOpeningView,
} from '@lfd/contracts/shop-values';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { ClientAudience } from '../client-audience.service';

/**
 * **La boutique prend-elle les commandes de qui regarde ?** — le réglage
 * « Ouverture de la boutique » (`GET /order-opening`, public, 2026-10-09)
 * appliqué à la clientèle de l'écran.
 *
 * Il ne FERME rien : la passation refuse elle-même en 409. Il évite seulement
 * de montrer un bouton de commande qui mène à un refus. Tant que le réglage
 * n'est pas lu, ou si sa lecture échoue, il vaut son défaut ouvert — le
 * serveur garde la porte ; et tant que la clientèle n'est pas connue (un pro
 * dont `/me` n'a pas répondu), on ne dit pas « fermé » à quelqu'un dont on ne
 * sait pas encore s'il l'est.
 */
@Injectable({ providedIn: 'root' })
export class OrderOpeningStore {
  private readonly http = inject(HttpClient);
  private readonly audience = inject(ClientAudience).current;

  private readonly held = signal<PublicOrderOpeningView | null>(null);
  private asked = false;

  /** Vrai si la boutique prend les commandes de la clientèle de l'écran. */
  readonly ordersOpen = computed(() => {
    const audience = this.audience();
    return audience === null || ordersOpenTo(this.held() ?? DEFAULT_ORDER_OPENING, audience);
  });

  /** Lit le réglage, une fois. Un échec laisse le défaut ouvert, et permet de relire. */
  async hydrate(): Promise<void> {
    if (this.asked) {
      return;
    }
    this.asked = true;
    try {
      this.held.set(
        await firstValueFrom(
          this.http.get<PublicOrderOpeningView>(`${AUTH_CONFIG.apiBaseUrl}/order-opening`),
        ),
      );
    } catch {
      this.asked = false;
    }
  }

  /** Pose un réglage déjà obtenu — les suites s'en servent au lieu de doubler le dépôt. */
  receive(view: PublicOrderOpeningView): void {
    this.asked = true;
    this.held.set(view);
  }
}

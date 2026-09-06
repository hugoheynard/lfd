import { HttpClient, HttpHeaders } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import type { SubscriptionView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/**
 * **Les paniers récurrents du client** (`GET /subscriptions/mine`).
 *
 * 🔴 Leur nombre était une constante — `recurringBaskets: 2` — affichée en
 * pastille dans le menu. Le compteur d'une destination annonce ce qui attend
 * derrière : en inventer le nombre, c'est promettre deux gabarits à quelqu'un
 * qui n'en a aucun.
 *
 * ⚠️ L'écran, lui, n'existe pas encore (`ready: false` dans le menu). Ce n'est
 * pas une raison pour mentir sur le compte : une pastille juste devant un écran
 * à venir vaut mieux qu'une pastille fausse devant le même.
 */
@Injectable({ providedIn: 'root' })
export class ClientSubscriptions {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly rows = signal<readonly SubscriptionView[]>([]);

  /** Les gabarits, tels que notre base les porte. Vide sans compte reconnu. */
  readonly all = this.rows.asReadonly();

  private asked = false;

  constructor() {
    effect(() => {
      if (!this.auth.isAuthenticated() || this.asked) {
        return;
      }
      this.asked = true;
      void this.load();
    });
  }

  /** Pose une liste déjà obtenue — les suites s'en servent au lieu de doubler. */
  receive(subscriptions: readonly SubscriptionView[]): void {
    this.rows.set(subscriptions);
    this.asked = true;
  }

  private async load(): Promise<void> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      this.rows.set(
        await firstValueFrom(
          this.http.get<readonly SubscriptionView[]>(
            `${AUTH_CONFIG.apiBaseUrl}/subscriptions/mine`,
            {
              headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
            },
          ),
        ),
      );
    } catch {
      // Vide, et relisible : une pastille absente est plus juste qu'une fausse.
      this.asked = false;
    }
  }
}

import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
// Types seuls, par le sous-chemin sans zod (budget `cloudflare`).
import type { GuestOrderAdmissionView, MyOrderAdmissionView } from '@lfd/contracts/shop-values';
import { firstValueFrom, switchMap } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientWorkspace } from '../client-workspace.service';
import { OrderOpeningStore } from './order-opening.store';

/** Ce que le serveur a répondu pour un espace (`ClientWorkspace.current`). */
interface MineAnswer {
  readonly workspace: string | null;
  readonly canOrder: boolean;
}

const keyOf = (email: string): string => email.trim().toLowerCase();

/**
 * **Fermée, mais vous pouvez commander** — les exemptions à la fermeture, vues
 * de la boutique (décision de Hugo du 2026-10-26, option A ; doc
 * `documentation/commandes/passation/ouverture-de-la-boutique.md`).
 *
 * `GET /order-opening` dit à qui la boutique est ouverte, sans liste
 * d'exemptions. Quand elle est FERMÉE à la clientèle de l'écran, ce service
 * demande au serveur si CETTE personne passerait quand même :
 *
 * - connectée : `GET /order-admission/mine`, une fois par espace ;
 * - sans compte : `POST /order-admission/guest`, pour l'adresse saisie, une
 *   fois par adresse — et seulement une fois la saisie complète.
 *
 * Ouverte, il ne demande rien. Il ne décide rien non plus : la passation
 * refuse elle-même en 409, et un échec de lecture laisse le bouton caché — on
 * ne promet pas une commande qu'on n'a pas su confirmer.
 */
@Injectable({ providedIn: 'root' })
export class OrderAdmissionStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly opening = inject(OrderOpeningStore);

  private readonly mine = signal<MineAnswer | null>(null);
  private readonly guestEmail = signal<string | null>(null);
  private readonly guestAnswers = signal<ReadonlyMap<string, boolean>>(new Map());
  private readonly asking = new Set<string>();

  /** Vrai si la boutique, fermée à cette clientèle, prendrait quand même SA commande. */
  readonly admitted = computed(() => {
    if (this.auth.isAuthenticated()) {
      const answer = this.mine();
      return answer !== null && answer.workspace === this.workspace.current() && answer.canOrder;
    }
    const email = this.guestEmail();
    return email !== null && this.guestAnswers().get(keyOf(email)) === true;
  });

  constructor() {
    effect(() => {
      if (this.opening.ordersOpen()) {
        return;
      }
      if (this.auth.isAuthenticated()) {
        void this.askMine(this.workspace.current());
        return;
      }
      const email = this.guestEmail();
      if (email !== null) {
        void this.askGuest(email);
      }
    });
  }

  /** L'adresse que l'invité a saisie, complète — ou `null` tant qu'elle ne l'est pas. */
  guestTyped(email: string | null): void {
    this.guestEmail.set(email);
  }

  private async askMine(workspace: string | null): Promise<void> {
    const key = `mine:${workspace ?? ''}`;
    if (this.mine()?.workspace === workspace || this.asking.has(key)) {
      return;
    }
    this.asking.add(key);
    try {
      const view = await firstValueFrom(
        this.auth.accessToken$().pipe(
          switchMap((token) =>
            this.http.get<MyOrderAdmissionView>(`${AUTH_CONFIG.apiBaseUrl}/order-admission/mine`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ),
        ),
      );
      this.mine.set({ workspace, canOrder: view.canOrder });
    } catch {
      // Laisse le bouton caché : la réponse manque, pas l'exemption.
    } finally {
      this.asking.delete(key);
    }
  }

  private async askGuest(email: string): Promise<void> {
    const key = keyOf(email);
    if (this.guestAnswers().has(key) || this.asking.has(key)) {
      return;
    }
    this.asking.add(key);
    try {
      const view = await firstValueFrom(
        this.http.post<GuestOrderAdmissionView>(`${AUTH_CONFIG.apiBaseUrl}/order-admission/guest`, {
          email: email.trim(),
        }),
      );
      this.guestAnswers.update((answers) => new Map(answers).set(key, view.canOrder));
    } catch {
      // Débit dépassé, panne : le bouton reste caché, la saisie peut être relue.
    } finally {
      this.asking.delete(key);
    }
  }
}

import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
// Types seuls, par le sous-chemin sans zod (budget `cloudflare`).
import type { GuestOrderAdmissionView, MyOrderAdmissionView } from '@lfd/contracts/shop-values';
import { firstValueFrom, switchMap } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientWorkspace } from '../client-workspace.service';
import { SHOP_TIME_ZONE } from '../shop-time-zone';
import { OrderOpeningStore } from './order-opening.store';
import { ShopClock } from './shop-clock';

/** Ce que le serveur a répondu pour un espace (`ClientWorkspace.current`). */
interface MineAnswer {
  readonly workspace: string | null;
  readonly canOrder: boolean;
  readonly firstServiceDay: string | null;
}

/** Ce que le serveur a répondu pour une adresse d'invité. */
interface GuestAnswer {
  readonly canOrder: boolean;
  readonly firstServiceDay: string | null;
}

/**
 * Pourquoi CETTE personne peut commander quand sa clientèle ne le peut pas
 * encore : une date d'ouverture future la laisse passer avant (`day`), ou la
 * boutique fermée l'admet quand même.
 */
export type EarlyAccess =
  { readonly kind: 'beforeOpening'; readonly day: string } | { readonly kind: 'duringClosure' };

/** Le jour de Paris (`AAAA-MM-JJ`) sans le baril `@lfd/contracts` : ce store est au démarrage. */
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHOP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

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
 * Depuis le 2026-10-28 (plan `plan-premier-jour-commandable.md`, lot J4), il
 * demande AUSSI quand un premier jour commandable est posé pour la clientèle :
 * la réponse dit la date qui s'applique à CETTE personne (`null` si une
 * exemption la couvre), exposée par {@link firstServiceDay}.
 *
 * Ouverte et sans date, il ne demande rien. Il ne décide rien non plus : la passation
 * refuse elle-même en 409, et un échec de lecture laisse le bouton caché — on
 * ne promet pas une commande qu'on n'a pas su confirmer.
 */
@Injectable({ providedIn: 'root' })
export class OrderAdmissionStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);
  private readonly opening = inject(OrderOpeningStore);
  private readonly clock = inject(ShopClock);

  private readonly mine = signal<MineAnswer | null>(null);
  private readonly guestEmail = signal<string | null>(null);
  private readonly guestAnswers = signal<ReadonlyMap<string, GuestAnswer>>(new Map());
  private readonly asking = new Set<string>();

  /** Vrai si la boutique, fermée à cette clientèle, prendrait quand même SA commande. */
  readonly admitted = computed(() => {
    if (this.auth.isAuthenticated()) {
      const answer = this.mine();
      return answer !== null && answer.workspace === this.workspace.current() && answer.canOrder;
    }
    const email = this.guestEmail();
    return email !== null && this.guestAnswers().get(keyOf(email))?.canOrder === true;
  });

  /**
   * **Le premier jour que CETTE personne peut commander** (`AAAA-MM-JJ`), ou
   * `null`. La réponse du serveur pour elle quand on l'a — exemption comprise,
   * qui rend `null` —, sinon la date de sa clientèle : un invité dont
   * l'adresse n'est pas encore saisie se voit appliquer celle des particuliers.
   */
  readonly firstServiceDay = computed<string | null>(() => {
    const own = this.ownAnswer();
    return own === null ? this.opening.firstServiceDay() : own.firstServiceDay;
  });

  /**
   * **L'accès anticipé** de qui regarde, ou `null` : la boutique fermée à sa
   * clientèle l'admet quand même, ou sa clientèle a une date d'ouverture
   * FUTURE dont le serveur l'a dite exemptée. `null` tant que la réponse pour
   * elle manque — on n'annonce pas une exemption qu'on n'a pas lue.
   */
  readonly earlyAccess = computed<EarlyAccess | null>(() => {
    if (!this.opening.ordersOpen()) {
      return this.admitted() ? { kind: 'duringClosure' } : null;
    }
    const day = this.opening.firstServiceDay();
    const own = this.ownAnswer();
    if (day === null || own === null || own.firstServiceDay !== null) {
      return null;
    }
    return day > PARIS_DAY.format(this.clock.now()) ? { kind: 'beforeOpening', day } : null;
  });

  /** La réponse du serveur pour qui regarde maintenant, ou `null` tant qu'elle manque. */
  private readonly ownAnswer = computed<GuestAnswer | null>(() => {
    if (this.auth.isAuthenticated()) {
      const answer = this.mine();
      return answer !== null && answer.workspace === this.workspace.current() ? answer : null;
    }
    const email = this.guestEmail();
    return email === null ? null : (this.guestAnswers().get(keyOf(email)) ?? null);
  });

  constructor() {
    effect(() => {
      if (this.opening.ordersOpen() && this.opening.firstServiceDay() === null) {
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

  /**
   * Oublie les réponses et relit le réglage : la passation vient de refuser
   * une journée (409 `orders.service_day_before_first_orderable_day`), ce
   * qu'on savait ne vaut plus. L'effet redemande ensuite pour qui regarde.
   */
  async reload(): Promise<void> {
    this.mine.set(null);
    this.guestAnswers.set(new Map());
    await this.opening.reload();
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
      this.mine.set({
        workspace,
        canOrder: view.canOrder,
        firstServiceDay: view.firstServiceDay ?? null,
      });
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
      this.guestAnswers.update((answers) =>
        new Map(answers).set(key, {
          canOrder: view.canOrder,
          firstServiceDay: view.firstServiceDay ?? null,
        }),
      );
    } catch {
      // Débit dépassé, panne : le bouton reste caché, la saisie peut être relue.
    } finally {
      this.asking.delete(key);
    }
  }
}

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type {
  ConvertMyLoyaltyPointsPayload,
  MyLoyaltyConversionResponse,
  MyLoyaltyView,
} from '@lfd/contracts';
// Par le sous-chemin sans zod : la fidélité est lue par le menu, au démarrage.
import { PERSONAL_WORKSPACE } from '@lfd/contracts/workspace';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientContext, VISITOR } from './client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from './context-keyed/context-keyed';

/** Où en est la lecture de `GET me/loyalty`. */
export type LoyaltyStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Ce qu'une conversion a donné — l'écran n'a besoin que de savoir quoi dire.
 *
 * - `converted` : le bon est émis ;
 * - `balance-changed` : le serveur a refusé en 409, le solde affiché n'est
 *   plus le bon (double clic, commande créditée entre-temps). La vue est
 *   relue ;
 * - `failed` : rien n'est écrit, pour une autre raison (réseau, 5xx).
 */
export type ConversionOutcome = 'converted' | 'balance-changed' | 'failed';

/**
 * Tout 409 se lit « le solde a changé » : le code dédié
 * `loyalty.balance_changed`, mais aussi `insufficient_points` ou un programme
 * refermé — dans tous les cas, relire est le bon geste.
 */
const HTTP_CONFLICT = 409;

const CLOSED: MyLoyaltyView = { open: false };

/** La seule clé qui ait une fidélité : l'espace personnel. */
const PERSONAL_KEY: ContextKey = { workspace: PERSONAL_WORKSPACE, own: '' };

/**
 * **La fidélité d'une personne connectée** — `GET me/loyalty` et
 * `POST me/loyalty/conversions` (plan des points, §12, E1.1).
 *
 * Le titulaire n'est jamais envoyé : le serveur le prend du principal, et
 * l'en-tête d'espace de travail (posé par l'intercepteur) dit s'il s'agit de
 * l'espace personnel.
 *
 * **Un seul lecteur pour le menu et la page.** La lecture part d'elle-même,
 * une fois par espace personnel connu : le lien « Ma fidélité » et la page
 * lisent le même état, sans second appel. Hors de l'espace personnel (société,
 * visiteur), la vue est `{ open: false }` sans rien demander — le serveur
 * répondrait la même chose (plan §12 : « un espace société, un invité :
 * rien »).
 */
@Injectable({ providedIn: 'root' })
export class ClientLoyalty {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  private readonly state = signal<LoyaltyStatus>('idle');
  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);

  /**
   * La fidélité, rangée par clé de contexte (lot d de
   * `caching-usage/plan-espace-retenu.md`) : seul l'espace personnel en a
   * une, et rien n'est rendu pour un autre espace que celui qui s'affiche.
   */
  private readonly keyed = contextKeyed((key) => this.read(key));

  /** L'espace qui s'affiche ({@link VISITOR} sans session), ou `null` tant qu'il n'est pas connu. */
  private readonly shownSpace = computed<string | null>(() =>
    this.auth.isAuthenticated() ? this.context.prefix() : VISITOR,
  );

  readonly status = this.state.asReadonly();

  /** `null` tant que rien n'a été lu ; fermée, sans rien demander, hors de l'espace personnel. */
  readonly view = computed<MyLoyaltyView | null>(() => {
    const space = this.shownSpace();
    if (space === null) {
      return null;
    }
    if (space !== PERSONAL_WORKSPACE) {
      return CLOSED;
    }
    this.answered();
    return this.keyed.shown(PERSONAL_KEY) ?? null;
  });

  /** Le programme est-il ouvert à la personne, ici et maintenant ? Faux tant qu'on ne sait pas. */
  readonly isOpen = computed(() => this.view()?.open === true);

  constructor() {
    // Une lecture par ARRIVÉE dans l'espace personnel, comme avant la brique :
    // y revenir relit le solde.
    effect(() => {
      const space = this.shownSpace();
      untracked(() => {
        if (space === PERSONAL_WORKSPACE) {
          void this.load();
        } else if (space !== null) {
          this.state.set('ready');
        }
      });
    });
  }

  /**
   * Lit la fidélité. Un échec est un ÉTAT : la dernière vue lue reste en
   * place, l'écran dit qu'il n'a pas pu relire. Hors de l'espace personnel,
   * rien à lire : la vue est déjà fermée.
   */
  async load(): Promise<void> {
    if (untracked(() => this.shownSpace()) !== PERSONAL_WORKSPACE) {
      this.state.set('ready');
      return;
    }
    this.state.set('loading');
    try {
      await this.keyed.read(PERSONAL_KEY);
      this.answered.update((count) => count + 1);
      this.state.set('ready');
    } catch {
      this.state.set('failed');
    }
  }

  /** L'appel — l'en-tête d'espace vient de la clé, pas de l'envoi. */
  private read(key: ContextKey): Observable<MyLoyaltyView> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<MyLoyaltyView>(
            `${AUTH_CONFIG.apiBaseUrl}/me/loyalty`,
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
          ),
        ),
      );
  }

  /**
   * Convertit `steps` paliers, en disant au serveur le solde que l'écran
   * montrait : c'est ce qui rend le double clic inoffensif (le second échoue
   * en 409, le premier ayant baissé le solde).
   */
  async convert(steps: number, expectedBalancePoints: number): Promise<ConversionOutcome> {
    const body: ConvertMyLoyaltyPointsPayload = { steps, expectedBalancePoints };
    try {
      await firstValueFrom(
        this.auth
          .accessToken$()
          .pipe(
            switchMap((token) =>
              this.http.post<MyLoyaltyConversionResponse>(
                `${AUTH_CONFIG.apiBaseUrl}/me/loyalty/conversions`,
                body,
                { headers: { Authorization: `Bearer ${token}` } },
              ),
            ),
          ),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === HTTP_CONFLICT) {
        await this.load();
        return 'balance-changed';
      }
      return 'failed';
    }
    await this.load();
    return 'converted';
  }
}

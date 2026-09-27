import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type {
  ConvertMyLoyaltyPointsPayload,
  MyLoyaltyConversionResponse,
  MyLoyaltyView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientWorkspace } from './client-workspace.service';

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
  private readonly workspace = inject(ClientWorkspace);

  private readonly state = signal<LoyaltyStatus>('idle');
  private readonly current = signal<MyLoyaltyView | null>(null);

  readonly status = this.state.asReadonly();
  /** `null` tant que rien n'a été lu. */
  readonly view = this.current.asReadonly();

  /** Le programme est-il ouvert à la personne, ici et maintenant ? Faux tant qu'on ne sait pas. */
  readonly isOpen = computed(() => this.current()?.open === true);

  /** L'espace pour lequel la vue a été lue ou demandée — la garde contre le double appel. */
  private readFor: string | null = null;

  constructor() {
    effect(() => {
      const signedIn = this.auth.isAuthenticated();
      const space = this.workspace.current();
      const personal = this.workspace.isPersonal();
      untracked(() => {
        if (!signedIn || (space !== null && !personal)) {
          this.readFor = null;
          this.current.set(CLOSED);
          this.state.set('ready');
          return;
        }
        // Reconnu, espace pas encore connu : on attend, comme le décompte.
        if (space === null || this.readFor === space) {
          return;
        }
        void this.load();
      });
    });
  }

  /**
   * Lit la fidélité. Un échec est un ÉTAT : la dernière vue lue reste en
   * place, l'écran dit qu'il n'a pas pu relire.
   */
  async load(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.current.set(CLOSED);
      this.state.set('ready');
      return;
    }
    this.readFor = this.workspace.current();
    this.state.set('loading');
    try {
      const view = await firstValueFrom(
        this.auth.accessToken$().pipe(
          switchMap((token) =>
            this.http.get<MyLoyaltyView>(`${AUTH_CONFIG.apiBaseUrl}/me/loyalty`, {
              headers: { Authorization: `Bearer ${token}` },
            }),
          ),
        ),
      );
      this.current.set(view);
      this.state.set('ready');
    } catch {
      this.state.set('failed');
    }
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

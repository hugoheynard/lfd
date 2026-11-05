import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { ActivationGate, CompanyView } from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientContext } from './client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from './context-keyed/context-keyed';

/**
 * **Le verdict d'activation de la société**, tel que le serveur le rend au
 * client (`GET /companies/:companyId/activation`, plan
 * `documentation/comptes-client/plan-mon-compte-a-completer.md` §2.1).
 *
 * L'écran ne recalcule pas ce qui manque : il lit la même fonction que celle
 * qui garde la porte côté staff. Une règle écrite deux fois finit par se
 * contredire — c'est arrivé à la fiche staff, qui allumait « Activer » sur un
 * dossier que le serveur refusait.
 *
 * ## Quand il se relit
 *
 * - **la société de `GET /me` change d'objet** ({@link follow}) : l'identité,
 *   le KBIS et les contacts s'écrivent par `AccountService`, qui relit `/me`
 *   après chaque écriture — la nouvelle vue suffit à relancer la lecture ;
 * - **la facturation est enregistrée** ({@link refresh}, appelé par
 *   `ClientAddresses`) : le carnet se relit de son côté, sans toucher `/me`.
 *
 * Le RIB n'y figure pas : le verdict ne le lit pas (vérifié le 2026-09-15,
 * `activation-gate.ts`). Ce que le RIB change — les mentions du mandat — se
 * relit déjà par `ClientMandate.refresh` au succès du panneau RIB.
 *
 * ⚠️ Un échec de lecture laisse `gate` à `null` : pas de synthèse, et la page
 * reste celle d'avant. Dire « rien ne manque » sur une lecture manquée serait
 * faux ; casser la page pour un encart d'aide le serait plus encore.
 */
@Injectable({ providedIn: 'root' })
export class ClientActivation {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  /** Avance à chaque réponse ou échec : la brique n'est pas un signal. */
  private readonly answered = signal(0);

  /**
   * Le verdict, rangé par clé de contexte (lot d de
   * `caching-usage/plan-espace-retenu.md`) : l'espace d'une société EST son
   * identifiant, et rien n'est rendu pour un autre espace que celui qui
   * s'affiche — après une bascule, le verdict de la société quittée ne reste
   * pas à l'écran le temps de lire le suivant.
   */
  private readonly keyed = contextKeyed((key) => this.read(key));

  /** Le verdict lu, ou `null` — pas encore lu, en échec, ou sans société. */
  readonly gate = computed<ActivationGate | null>(() => {
    this.answered();
    const shown = this.context.prefix();
    return shown === null ? null : (this.keyed.shown(keyOf(shown)) ?? null);
  });

  /** La vue de société déjà lue : une autre instance (relue par `/me`) relance la lecture. */
  private seen: CompanyView | null = null;

  /**
   * Suit la société que `/me` porte : la lit la première fois, et la relit à
   * chaque nouvelle vue — c'est-à-dire après chaque écriture qui relit `/me`.
   */
  follow(company: CompanyView): void {
    if (company === this.seen) {
      return;
    }
    this.seen = company;
    void this.reload(company.id);
  }

  /** Relit **seulement si cette société est suivie** — sans écran montré, rien à rafraîchir. */
  async refresh(companyId: string): Promise<void> {
    if (this.seen?.id === companyId) {
      await this.reload(companyId);
    }
  }

  private async reload(companyId: string): Promise<void> {
    try {
      await this.keyed.read(keyOf(companyId));
    } catch {
      // Un échec ne garde pas l'ancien verdict : « rien ne manque » serait faux.
      this.keyed.forget(companyId);
    }
    this.answered.update((count) => count + 1);
  }

  /** L'appel — l'en-tête d'espace vient de la clé, pas de l'envoi. */
  private read(key: ContextKey): Observable<ActivationGate> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<ActivationGate>(
            `${AUTH_CONFIG.apiBaseUrl}/companies/${key.workspace}/activation`,
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
          ),
        ),
      );
  }
}

/** La clé d'une société : son espace, sans part propre. */
function keyOf(companyId: string): ContextKey {
  return { workspace: companyId, own: '' };
}

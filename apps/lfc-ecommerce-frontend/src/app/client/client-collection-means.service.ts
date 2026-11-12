import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type { CollectionMeansName, CompanyView, MyCollectionMeansView } from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientContext } from './client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from './context-keyed/context-keyed';

/**
 * **Comment la société règle au compte** — prélèvement SEPA ou virement à
 * réception de facture (`GET /companies/:companyId/collection-means`, plan
 * `documentation/comptabilite/plan-paiement-au-compte-par-virement.md`, T5).
 * Le staff seul le choisit (Q3) ; l'écran le lit pour dire « par virement »
 * sur la carte Paiement et retirer l'espace mandat d'un client au virement.
 * Aucune coordonnée bancaire n'est servie : elles ne sont que sur la facture.
 *
 * Même forme que `ClientActivation` : rangé par clé de contexte, suivi sur la
 * société de `/me`. Un échec de lecture laisse `means` à `null` : l'écran
 * garde alors ce qu'il montrait sans lui, plutôt que d'affirmer un moyen.
 */
@Injectable({ providedIn: 'root' })
export class ClientCollectionMeans {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  /** Avance à chaque réponse ou échec : la brique n'est pas un signal. */
  private readonly answered = signal(0);
  private readonly keyed = contextKeyed((key) => this.read(key));

  /** Le moyen lu pour l'espace qui s'affiche ; `null` : pas encore lu, en échec, ou sans société. */
  readonly means = computed<CollectionMeansName | null>(() => {
    this.answered();
    const shown = this.context.prefix();
    return shown === null ? null : (this.keyed.shown(keyOf(shown))?.means ?? null);
  });

  /** La vue de société déjà lue : une autre instance (relue par `/me`) relance la lecture. */
  private seen: CompanyView | null = null;

  /** Suit la société que `/me` porte : la lit la première fois, et à chaque nouvelle vue. */
  follow(company: CompanyView): void {
    if (company === this.seen) {
      return;
    }
    this.seen = company;
    void this.reload(company.id);
  }

  private async reload(companyId: string): Promise<void> {
    try {
      await this.keyed.read(keyOf(companyId));
    } catch {
      // Un échec n'affirme aucun moyen : la carte garde son texte sans lui.
      this.keyed.forget(companyId);
    }
    this.answered.update((count) => count + 1);
  }

  /** L'appel — l'en-tête d'espace vient de la clé, pas de l'envoi. */
  private read(key: ContextKey): Observable<MyCollectionMeansView> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<MyCollectionMeansView>(
            `${AUTH_CONFIG.apiBaseUrl}/companies/${key.workspace}/collection-means`,
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

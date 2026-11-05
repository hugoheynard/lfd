import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  CustomerBankAccountSectionView,
  CustomerBankAccountView,
  SetCompanyBankAccountPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientContext } from './client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from './context-keyed/context-keyed';

/** Où en est la lecture du RIB. */
export type BankReadStatus = 'loading' | 'failed' | 'ready';

/**
 * **Le RIB de la société**, tel que le client le voit et le dépose sur
 * `/mon-compte` (`documentation/comptabilite/mandat/rib-client.md`, §6).
 *
 * Deux gestes, et pas un de plus : lire, écrire. Il garde **une** lecture,
 * parce que deux cartes la montrent en même temps — la carte bureau et la
 * carte mobile sont toutes deux dans le DOM, le CSS n'en affiche qu'une — et
 * qu'elles ne doivent pas lire le RIB deux fois.
 *
 * 🔴 L'IBAN **monte en clair et ne redescend jamais** : la lecture n'en rend
 * que `last4`. Le mur (rôle `owner` ou `billing`, 404 hors société) est tenu
 * par l'API ; l'écran ne fait que ne pas proposer la carte aux autres rôles.
 */
@Injectable({ providedIn: 'root' })
export class ClientBankAccount {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  private readonly context = inject(ClientContext);

  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);
  /** L'espace dont la dernière lecture a échoué, `null` sinon. */
  private readonly failedSpace = signal<string | null>(null);

  /**
   * Le RIB, rangé par clé de contexte (lot d de
   * `caching-usage/plan-espace-retenu.md`) : l'espace d'une société EST son
   * identifiant, et rien n'est rendu pour un autre espace que celui qui
   * s'affiche — après une bascule, les quatre derniers chiffres de la
   * société quittée ne restent pas sous le nom de la suivante.
   */
  private readonly keyed = contextKeyed((key) => this.read(key));

  /** La section lue pour l'espace qui s'affiche, ou `undefined`. */
  private readonly shown = computed<CustomerBankAccountSectionView | undefined>(() => {
    this.answered();
    const space = this.context.prefix();
    return space === null ? undefined : this.keyed.shown(keyOf(space));
  });

  readonly status = computed<BankReadStatus>(() => {
    const space = this.context.prefix();
    if (space !== null && this.failedSpace() === space) {
      return 'failed';
    }
    return this.shown() === undefined ? 'loading' : 'ready';
  });

  readonly account = computed<CustomerBankAccountView | null>(() => this.shown()?.account ?? null);

  /**
   * Lit le RIB de la société si ce n'est pas déjà fait. Appelé par chaque
   * carte : la seconde ne relit pas. Paresseux plutôt qu'automatique, parce
   * que seuls `owner` et `billing` voient ces cartes — les autres rôles ne
   * doivent pas déclencher une lecture que l'API leur refuserait.
   */
  ensure(companyId: string): void {
    void this.settle(companyId, this.keyed.ensure(keyOf(companyId)));
  }

  /** Relit : après un échec (« Réessayer »), ou après un enregistrement. */
  async reload(companyId: string): Promise<void> {
    if (this.failedSpace() === companyId) {
      this.failedSpace.set(null);
    }
    await this.settle(companyId, this.keyed.read(keyOf(companyId)));
  }

  /** Un échec est un ÉTAT : la dernière section lue reste, l'écran dit qu'il n'a pas pu relire. */
  private async settle(
    companyId: string,
    reading: Promise<CustomerBankAccountSectionView>,
  ): Promise<void> {
    try {
      await reading;
      if (this.failedSpace() === companyId) {
        this.failedSpace.set(null);
      }
    } catch {
      this.failedSpace.set(companyId);
    }
    this.answered.update((count) => count + 1);
  }

  /** `GET /companies/:companyId/bank-account` — `{ account: null }` sans RIB déposé. */
  private read(key: ContextKey): Observable<CustomerBankAccountSectionView> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<CustomerBankAccountSectionView>(
            this.url(key.workspace),
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
          ),
        ),
      );
  }

  /**
   * `PUT` du compte entier (204) : l'appelant relit ensuite, la réponse ne porte
   * rien.
   *
   * Rend `null` au succès et le **message du serveur** au refus, plutôt que de
   * rejeter : un IBAN refusé se corrige dans le panneau resté ouvert, sous les
   * yeux de qui l'a saisi (même contrat que `AccountService.saveIdentity`).
   */
  async save(companyId: string, payload: SetCompanyBankAccountPayload): Promise<string | null> {
    try {
      await firstValueFrom(
        this.http.put(this.url(companyId), payload, { headers: await this.headers() }),
      );
      return null;
    } catch (error) {
      return httpErrorMessage(error);
    }
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/bank-account`;
  }

  private async headers(): Promise<HttpHeaders> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }
}

/** La clé d'une société : son espace, sans part propre. */
function keyOf(companyId: string): ContextKey {
  return { workspace: companyId, own: '' };
}

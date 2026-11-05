import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, untracked } from '@angular/core';
import type { AudiencePickupAddressView } from '@lfd/contracts';
import type { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientContext, VISITOR } from '../client-context.service';
import { contextKeyed, type ContextKey, workspaceHeadersOf } from '../context-keyed/context-keyed';

/** Le lecteur anonyme : la route publique, qui ne sert que les points des particuliers. */
export { VISITOR };

/**
 * **La liste des points de retrait, pour qui regarde** (Hugo, 2026-10-15 :
 * « c'est devenu un choix business », la liste est filtrée AU SERVEUR).
 *
 * Un visiteur lit `GET /pickup-addresses` (les points des particuliers) ; un
 * client reconnu lit `GET /pickup-addresses/mine`, ceux de la clientèle de
 * son espace. Aucun identifiant de société dans l'URL : l'espace part dans
 * l'en-tête, posé ici pour le lecteur demandé — pendant une bascule,
 * `workspaceInterceptor` dirait déjà l'espace pas encore accepté (lot c).
 */
@Injectable({ providedIn: 'root' })
export class PickupListGateway {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  /** Le préfixe de {@link ClientContext} : les points ne dépendent de rien d'autre. */
  readerKey(): string | null {
    return this.context.prefix();
  }

  /** Quelqu'un a-t-il lu les points ? Sans lecteur, une bascule ne lit rien d'avance. */
  private asked = false;

  /**
   * Les points, rangés par clé de contexte (lot c bis) : la brique tient la
   * lecture d'avance de la bascule et de l'essai, la jette et la coupe quand
   * l'espace est abandonné, et se vide à la déconnexion. Les points ne
   * dépendent que de l'espace : la part propre de la clé est vide.
   */
  private readonly keyed = contextKeyed((key) => this.read(key));

  constructor() {
    effect(() => {
      const ahead = this.context.ahead();
      if (ahead !== null && this.asked) {
        untracked(() => {
          this.keyed.ahead(keyOf(ahead));
        });
      }
    });
  }

  /**
   * Quelqu'un attend les points, mais le lecteur n'est pas encore connu :
   * pendant l'essai du démarrage (lot e), ceux de l'espace retenu partent
   * tout de suite, rangés sous lui et repris par {@link pickupsOf} si `/me`
   * le confirme.
   */
  expect(): void {
    this.asked = true;
    const ahead = untracked(() => this.context.ahead());
    if (ahead !== null) {
      this.keyed.ahead(keyOf(ahead));
    }
  }

  /** Les points de CE lecteur — repris de la lecture faite d'avance s'il y en a une. */
  pickupsOf(reader: string): Promise<readonly AudiencePickupAddressView[]> {
    this.asked = true;
    return this.keyed.read(keyOf(reader));
  }

  /** L'appel d'une clé — son en-tête d'espace vient de la clé, pas de l'envoi. */
  private read(key: ContextKey): Observable<readonly AudiencePickupAddressView[]> {
    const base = AUTH_CONFIG.apiBaseUrl;
    if (key.workspace === VISITOR) {
      return this.http.get<readonly AudiencePickupAddressView[]>(`${base}/pickup-addresses`);
    }
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get<readonly AudiencePickupAddressView[]>(`${base}/pickup-addresses/mine`, {
          headers: { Authorization: `Bearer ${token}`, ...workspaceHeadersOf(key) },
        }),
      ),
    );
  }
}

function keyOf(reader: string): ContextKey {
  return { workspace: reader, own: '' };
}

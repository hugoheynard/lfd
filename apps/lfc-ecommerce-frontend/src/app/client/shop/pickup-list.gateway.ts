import { HttpClient } from '@angular/common/http';
import { effect, inject, Injectable, untracked } from '@angular/core';
import type { AudiencePickupAddressView } from '@lfd/contracts';
import { WORKSPACE_HEADER } from '@lfd/contracts/workspace';
import { firstValueFrom } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { AheadReads } from '../ahead-reads';
import { ClientContext, VISITOR } from '../client-context.service';

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

  /** Les points de l'espace demandé, lus pendant la bascule (lot c). */
  private readonly aheadReads = new AheadReads<readonly AudiencePickupAddressView[]>();

  constructor() {
    effect(() => {
      const ahead = this.context.ahead();
      if (ahead !== null && this.asked) {
        untracked(() => {
          this.aheadReads.ask(ahead, ahead, () => this.read(ahead));
        });
      }
    });
    this.context.whenAbandoned((workspace) => {
      this.aheadReads.forget(workspace);
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
      this.aheadReads.ask(ahead, ahead, () => this.read(ahead));
    }
  }

  /** Les points de CE lecteur — repris de la lecture faite d'avance s'il y en a une. */
  pickupsOf(reader: string): Promise<readonly AudiencePickupAddressView[]> {
    this.asked = true;
    return this.aheadReads.take(reader) ?? this.read(reader);
  }

  private read(reader: string): Promise<readonly AudiencePickupAddressView[]> {
    const base = AUTH_CONFIG.apiBaseUrl;
    if (reader === VISITOR) {
      return firstValueFrom(
        this.http.get<readonly AudiencePickupAddressView[]>(`${base}/pickup-addresses`),
      );
    }
    return firstValueFrom(
      this.auth.accessToken$().pipe(
        switchMap((token) =>
          this.http.get<readonly AudiencePickupAddressView[]>(`${base}/pickup-addresses/mine`, {
            headers: { Authorization: `Bearer ${token}`, [WORKSPACE_HEADER]: reader },
          }),
        ),
      ),
    );
  }
}

import { HttpClient } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
// Type seul : aucune valeur du baril n'entre ici (budget `cloudflare`).
import type { PlannerAccessView } from '@lfd/contracts';
import { map, type Observable, switchMap } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';
import { ClientContext, VISITOR } from '../client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from '../context-keyed/context-keyed';

/** L'accès d'un espace ne dépend de rien d'autre que l'espace. */
const keyOf = (workspace: string): ContextKey => ({ workspace, own: '' });

/**
 * **« Le planificateur est-il ouvert dans cet espace ? »** — la réponse de
 * `GET /planner/access`, rangée par espace (`client/context-keyed/`).
 *
 * Le planificateur s'ouvre à une SOCIÉTÉ, pas à une personne (doc
 * `documentation/b2b/plan-exemption-par-societe.md`, § 3) : `GET /me`, lu sans
 * espace et une fois par chargement, ne peut pas le dire. Ce lecteur demande
 * pour l'espace affiché, et changer d'espace le relit ; la réponse d'un autre
 * espace n'est jamais rendue.
 *
 * Il ne ferme rien : l'API refuse les routes du planificateur en 409. Fermé
 * tant qu'on ne sait pas — lecture en vol ou en échec — : une entrée montrée à
 * tort mènerait à un écran dont chaque requête serait refusée.
 */
@Injectable({ providedIn: 'root' })
export class PlannerAccessStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);

  private readonly keyed = contextKeyed((key) => this.load(key));
  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);

  /** L'espace qui s'affiche, s'il y en a un où demander. */
  private readonly workspace = computed<string | null>(() => {
    const prefix = this.auth.isAuthenticated() ? this.context.prefix() : null;
    return prefix === VISITOR ? null : prefix;
  });

  /** Vrai si le planificateur est ouvert dans l'espace affiché ; faux tant qu'on ne sait pas. */
  readonly open = computed<boolean>(() => {
    this.answered();
    const workspace = this.workspace();
    return workspace !== null && this.keyed.shown(keyOf(workspace)) === true;
  });

  constructor() {
    effect(() => {
      const workspace = this.workspace();
      if (workspace !== null) {
        untracked(() => void this.ask(workspace));
      }
    });
  }

  /**
   * La réponse pour l'espace affiché, attendue — ce que lit la garde de
   * `/planificateur`. Faux sans espace, et en cas d'échec.
   */
  async openHere(): Promise<boolean> {
    const workspace = this.workspace();
    return workspace === null ? false : this.ask(workspace);
  }

  private async ask(workspace: string): Promise<boolean> {
    try {
      const open = await this.keyed.ensure(keyOf(workspace));
      this.answered.update((count) => count + 1);
      return open;
    } catch {
      // Laisse l'entrée cachée : c'est la réponse qui manque, pas l'accès.
      return false;
    }
  }

  /** L'appel d'un espace — son en-tête vient de la clé, pas de l'envoi. */
  private load(key: ContextKey): Observable<boolean> {
    return this.auth.accessToken$().pipe(
      switchMap((token) =>
        this.http.get<PlannerAccessView>(
          `${AUTH_CONFIG.apiBaseUrl}/planner/access`,
          workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
        ),
      ),
      map((view) => view.open),
    );
  }
}

import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { ActivationGate, CompanyView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

/**
 * **Le verdict d'activation de la société**, tel que le serveur le rend au
 * client (`GET /companies/:companyId/activation`, plan
 * `documentation/b2b/plan-mon-compte-a-completer.md` §2.1).
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

  private readonly _gate = signal<ActivationGate | null>(null);

  /** Le verdict lu, ou `null` — pas encore lu, en échec, ou sans société. */
  readonly gate = this._gate.asReadonly();

  /** La vue de société déjà lue : une autre instance (relue par `/me`) relance la lecture. */
  private seen: CompanyView | null = null;
  private readFor: string | null = null;

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

  /** Relit **seulement si cette société a déjà été lue** — sans écran montré, rien à rafraîchir. */
  async refresh(companyId: string): Promise<void> {
    if (this.readFor === companyId) {
      await this.reload(companyId);
    }
  }

  private async reload(companyId: string): Promise<void> {
    this.readFor = companyId;
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      const gate = await firstValueFrom(
        this.http.get<ActivationGate>(
          `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/activation`,
          { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
        ),
      );
      this._gate.set(gate);
    } catch {
      this._gate.set(null);
    }
  }
}

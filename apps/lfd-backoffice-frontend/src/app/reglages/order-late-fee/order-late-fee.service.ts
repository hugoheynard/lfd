import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { OrderLateFeePayload, OrderLateFeeView } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **La surtaxe de commande tardive** — un réglage unique, ou rien du tout.
 *
 * `null` en lecture n'est pas un trou de configuration : c'est le rattrapage
 * **gratuit**, et c'en est un choix. Le retirer est donc un `DELETE` et non
 * l'écriture d'un zéro — « 0 € de surtaxe » et « pas de surtaxe » se relisent
 * différemment six mois plus tard, et le serveur ne stocke pas le premier.
 *
 * Pas d'identifiant nulle part : le coût couvert est la reprise d'une
 * production close, il ne dépend ni du client, ni du comptoir, ni de l'article.
 * La base le tient par un `CHECK "id" = 'singleton'`.
 */
@Injectable({ providedIn: 'root' })
export class OrderLateFeeService {
  private readonly http = inject(HttpClient);

  /** Le réglage courant, ou `null` — aucune surtaxe. */
  read(): Promise<OrderLateFeeView> {
    return firstValueFrom(this.http.get<OrderLateFeeView>(this.url()));
  }

  /** Pose le montant et son taux. Le taux n'a **pas** de défaut côté serveur. */
  async save(payload: OrderLateFeePayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.url(), payload));
  }

  /** Retire la surtaxe : les dérogations redeviennent gratuites. */
  async clear(): Promise<void> {
    await firstValueFrom(this.http.delete<void>(this.url()));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/order-late-fee`;
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  CustomerCancellationSettingsPatch,
  CustomerCancellationSettingsView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * **L'annulation par les particuliers** — un réglage unique, posé dans
 * « E-commerce LFC → Réglages → Commandes » (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.5).
 *
 * Le serveur rend une vue même quand personne n'a rien réglé : fermée, 24 h,
 * `updatedAt` et `updatedBy` à `null`.
 */
@Injectable({ providedIn: 'root' })
export class CustomerCancellationService {
  private readonly http = inject(HttpClient);

  read(): Promise<CustomerCancellationSettingsView> {
    return firstValueFrom(this.http.get<CustomerCancellationSettingsView>(this.url()));
  }

  /** Seules les clés présentes changent. `204` sans corps : l'appelant relit. */
  update(patch: CustomerCancellationSettingsPatch): Promise<void> {
    return firstValueFrom(this.http.patch<void>(this.url(), patch));
  }

  private url(): string {
    return `${B2B_API_BASE}/admin/customer-cancellation`;
  }
}

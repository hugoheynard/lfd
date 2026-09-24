import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { StorefrontCatalogView, StorefrontPayloadInput, StorefrontView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La vitrine** — charger, enregistrer (`plan-vitrine-enregistrement.md`, D6).
 *
 * Murée côté serveur par `@AdminSurface("b2b_storefront")` : `GET` demande la
 * lecture, `PUT` l'écriture.
 */
@Injectable({ providedIn: 'root' })
export class StorefrontService {
  private readonly http = inject(HttpClient);

  /** La vitrine entière. Jamais enregistrée : `{ revision: 0 }`, vide. */
  load(): Promise<StorefrontView> {
    return firstValueFrom(this.http.get<StorefrontView>(`${B2B_API_BASE}/admin/storefront`));
  }

  /**
   * Les rayons et les articles que l'éditeur désigne — sans prix ni réglages.
   * Sous `b2b_storefront:read` : la communication n'a pas `b2b_catalog`, et
   * `/admin/catalog` lui rendait un 403.
   */
  catalog(): Promise<StorefrontCatalogView> {
    return firstValueFrom(
      this.http.get<StorefrontCatalogView>(`${B2B_API_BASE}/admin/storefront/catalog`),
    );
  }

  /**
   * Enregistre la vitrine ENTIÈRE, et la publie. Rend `void` : l'éditeur relit
   * ensuite (les objets neufs y reçoivent leur identifiant). `409` si quelqu'un
   * a enregistré depuis la révision envoyée.
   */
  async save(payload: StorefrontPayloadInput): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${B2B_API_BASE}/admin/storefront`, payload));
  }
}

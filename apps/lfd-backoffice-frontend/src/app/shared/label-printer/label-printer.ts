import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import { NotifyService } from '../../notify.service';
import { blobRefusalMessage } from '../download/blob-refusal';

/** Combien de temps garder l'adresse d'un PDF ouvert avant de la libérer. */
const BLOB_LIFETIME_MS = 60_000;

/**
 * **Les étiquettes A6 du colisage et du chargement, en PDF** (2026-10-25,
 * Hugo : « imprimer l'étiquette devrait donner un beau PDF, là on est sur une
 * capture d'écran »). Le serveur les dessine, une par feuille ; l'écran les
 * ouvre dans un onglet, d'où le navigateur les imprime. Elles remplacent les
 * pages web d'impression des sacs et des bacs, retirées le même jour.
 *
 * Par `HttpClient` et non par un lien : un `<a href>` partirait sans le jeton
 * staff (`save-blob.ts`). Un refus du serveur — plus de sac, bac annulé, droit
 * manquant — se dit en toast, avec son message.
 *
 * 🔴 Imprimer est une LECTURE : rien n'est créé, réimprimer non plus.
 */
@Injectable({ providedIn: 'root' })
export class LabelPrinter {
  private readonly http = inject(HttpClient);
  private readonly notify = inject(NotifyService);

  /** Les sacs d'une commande, sur la journée du poste ; `containerIds` vide : tous. */
  bags(date: string, orderId: string, containerIds: readonly string[]): Promise<void> {
    const url = `${B2B_API_BASE}/admin/packing/${encodeURIComponent(date)}/orders/${encodeURIComponent(orderId)}/bag-labels.pdf`;
    return this.open(url, { sacs: containerIds });
  }

  /** Les bacs d'une commande ; `binIds` vide : tous. */
  orderBins(orderId: string, binIds: readonly string[]): Promise<void> {
    return this.open(`${B2B_API_BASE}/admin/delivery/packing/bin-labels`, {
      order: [orderId],
      bacs: binIds,
    });
  }

  /** Les bacs d'un transfert interne ; `binIds` vide : tous. */
  transferBins(transferId: string, binIds: readonly string[]): Promise<void> {
    const url = `${B2B_API_BASE}/admin/delivery/packing/bin-labels/transfers/${encodeURIComponent(transferId)}`;
    return this.open(url, { bacs: binIds });
  }

  private async open(
    url: string,
    query: Readonly<Record<string, readonly string[]>>,
  ): Promise<void> {
    const params = Object.fromEntries(
      Object.entries(query)
        .filter(([, values]) => values.length > 0)
        .map(([key, values]) => [key, values.join(',')]),
    );
    try {
      const blob = await firstValueFrom(this.http.get(url, { params, responseType: 'blob' }));
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener');
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, BLOB_LIFETIME_MS);
    } catch (caught) {
      // La réponse attendue était un FICHIER : le refus arrive en `Blob`, et
      // son message ne se lit qu'en le décodant.
      const message = await blobRefusalMessage(caught);
      this.notify.error({ error: { message } }, 'Les étiquettes n’ont pas pu être imprimées.');
    }
  }
}

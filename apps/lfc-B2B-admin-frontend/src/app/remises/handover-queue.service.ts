import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { HandoverQueueView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **La file du comptoir**, pour une journée de service.
 *
 * Un service à part de `HandoverService` (`retrait/`), et c'est le contrat qui
 * le dicte : la vue détaillée répond « qu'est-ce que je tends à cette
 * personne » — elle porte les lignes, et se lit derrière un jeton de QR. Celle-ci
 * répond « qui attend, et depuis quand » — des dizaines de lignes, aucune ligne
 * de marchandise, et aucun jeton. Les mêmes octets d'API, deux gestes qui ne se
 * croisent jamais.
 *
 * Sans état : la file se relit à chaque changement de jour, et deux journées
 * n'ont rien à se transmettre.
 *
 * ⚠️ **Un seul appel peint tout l'écran, onglets compris.** Le serveur rend le
 * jour entier, tous points de retrait confondus, et le filtrage par onglet se
 * fait ici — c'est écrit dans le port côté back : filtrer au serveur
 * demanderait deux appels pour une page, et le second onglet afficherait un
 * compteur qu'il n'a pas encore chargé.
 */
@Injectable({ providedIn: 'root' })
export class HandoverQueueService {
  private readonly http = inject(HttpClient);

  /** Ce que le comptoir attend ce jour-là. `day` au format `AAAA-MM-JJ`. */
  async forDay(day: string): Promise<HandoverQueueView> {
    return firstValueFrom(
      this.http.get<HandoverQueueView>(
        `${B2B_API_BASE}/admin/handover/file?jour=${encodeURIComponent(day)}`,
      ),
    );
  }
}

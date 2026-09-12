import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { HandoverQueueView, OrderHandoverView } from '@lfd/contracts';

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

  /**
   * **Ce qu'il y a dans le sac** d'une commande de la file, par son identifiant.
   *
   * 🔴 Elle remplace `AdminOrdersService.byId()` depuis le 2026-09-11, et ce
   * n'est pas un rangement : cette route-là rendait l'`OrderView` du CLIENT —
   * prix unitaires, TVA, totaux, et la trace de négociation étage par étage —
   * sur un poste de comptoir, avec quelqu'un en face. Les trois surfaces de
   * remise promettent « aucun montant » ; deux le tenaient par leur forme, le
   * rail par la seule discrétion de son gabarit.
   *
   * `OrderHandoverView` n'en porte aucun. La promesse est redevenue
   * structurelle : ce qui n'est pas dans la vue ne traverse pas le réseau.
   */
  async byOrderId(orderId: string): Promise<OrderHandoverView> {
    return firstValueFrom(
      this.http.get<OrderHandoverView>(
        `${B2B_API_BASE}/admin/handover/order/${encodeURIComponent(orderId)}`,
      ),
    );
  }

  /**
   * **La remise saisie**, par le numéro de commande — le chemin sans QR.
   *
   * 🔴 Elle grave `manual`, et c'est tout ce qui la distingue du scan côté
   * serveur. Une remise saisie n'a eu qu'**une** partie : l'équipe. La présenter
   * comme un scan la rendrait fausse plutôt que faible — c'est pour cela que le
   * serveur porte deux verbes, et que l'écran écrit « sans code » à côté.
   *
   * Elle vit ici et non dans `HandoverService` (`retrait/`) parce qu'elle ne
   * touche aucun jeton : ce service est celui des gestes qui partent de la file.
   */
  async confirmManually(reference: string): Promise<OrderHandoverView> {
    return firstValueFrom(
      this.http.post<OrderHandoverView>(
        `${B2B_API_BASE}/admin/handover/manual/${encodeURIComponent(reference)}`,
        {},
      ),
    );
  }
}

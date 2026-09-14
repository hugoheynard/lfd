import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { ProductionPackingAck, ProductionPackingView } from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * **Le poste de colisage** d'une journée : les bacs, la ressource, et les deux
 * gestes qu'on y fait.
 *
 * Jumeau de {@link WorksheetService} et séparé de lui pour la même raison qu'il
 * est séparé de `ProductionService` : la fiche d'atelier répond à « qu'est-ce
 * qu'on sort du four », le colisage à « ce bac est-il complet ». Deux questions,
 * deux raisons de changer.
 *
 * Aucun état gardé ici : {@link PackingQueue} est le seul endroit qui retient
 * quelque chose, et elle le fait explicitement.
 */
@Injectable({ providedIn: 'root' })
export class PackingService {
  private readonly http = inject(HttpClient);

  /**
   * Les bacs **et** la ressource d'une journée de service (`AAAA-MM-JJ`), en une
   * lecture — la balance n'a de sens que si ses deux plateaux viennent du même
   * instant. Deux appels laisseraient une fenêtre où le reste affiché ne
   * correspondrait à aucun état réel.
   */
  async packing(date: string): Promise<ProductionPackingView> {
    return firstValueFrom(
      this.http.get<ProductionPackingView>(
        `${B2B_API_BASE}/admin/production/packing?date=${encodeURIComponent(date)}`,
      ),
    );
  }

  /**
   * Met une ligne dans le bac, ou l'en retire.
   *
   * Les deux gestes en une méthode plutôt qu'en deux : l'appelant est une file
   * qui rejoue des intentions, et une intention porte son sens (`packed`) comme
   * une donnée. Deux méthodes l'auraient obligée à un `if` à chaque envoi.
   */
  async mark(
    date: string,
    reference: string,
    sku: string,
    packed: boolean,
    initials: string,
  ): Promise<void> {
    const url = `${B2B_API_BASE}/admin/production/packing/${encodeURIComponent(date)}/sheets/${encodeURIComponent(reference)}/lines/${encodeURIComponent(sku)}`;
    await firstValueFrom(
      packed ? this.http.put<void>(url, { initials }) : this.http.delete<void>(url),
    );
  }

  /**
   * **Combien de containers la commande occupe** — les contenants qu'on charge
   * dans le véhicule.
   *
   * 🔴 **Aucun rapport avec `production_container`**, qui est le matériel du
   * FOUR (combien de baguettes tiennent sur une tourneuse, réglé par SKU une
   * fois pour toutes). Ni la même clé, ni le même rythme, ni la même personne —
   * et le front ne réutilise aucun de ses noms pour que la confusion n'ait pas
   * d'endroit où naître.
   *
   * Hors de la file hors ligne, comme la déclaration : c'est un nombre qu'on
   * relit sur un quai de chargement, et le montrer enregistré alors qu'il ne
   * l'est pas ferait charger un camion sur une croyance.
   */
  async setContainers(date: string, reference: string, containers: number): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(
        `${B2B_API_BASE}/admin/production/packing/${encodeURIComponent(date)}/sheets/${encodeURIComponent(reference)}/containers`,
        { containers },
      ),
    );
  }

  /**
   * **Déclare la commande prête** — le fait irréversible du poste.
   *
   * ⚠️ **Deux mots, et ils ne sont pas synonymes.** Côté serveur le fait
   * s'appelle `OrderPackedEvent` : « colisé », ce que le fournil a fait. Le
   * commerce en tire `ready`, « prête pour le client ». La distinction est
   * délibérée — un colis fait n'est pas toujours remettable, un bac peut
   * attendre le froid. L'écran nomme l'EFFET, que l'exploitant comprend ; le
   * nom de cette méthode suit le fait, qui est ce que la route écrit. Renommer
   * l'événement pour « aligner » les deux effacerait la distinction.
   *
   * 🔴 Volontairement HORS de la file hors ligne : une coche qui attend le
   * réseau ne coûte rien, une déclaration qui attend en silence annoncerait au
   * client un colis que personne n'a vu partir. Elle échoue donc à l'écran.
   *
   * La route est celle du QR des feuilles déjà imprimées : elle existe avant cet
   * écran, et rescanner **réannonce** le fait au lieu de refuser — d'où l'accusé
   * plutôt qu'un `204`.
   */
  async packOrder(date: string, reference: string): Promise<ProductionPackingAck> {
    return firstValueFrom(
      this.http.post<ProductionPackingAck>(
        `${B2B_API_BASE}/admin/production/batch/${encodeURIComponent(date)}/sheets/${encodeURIComponent(reference)}/packed`,
        {},
      ),
    );
  }
}

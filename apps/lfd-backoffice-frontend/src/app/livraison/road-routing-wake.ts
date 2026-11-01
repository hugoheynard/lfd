import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';

import { B2B_API_BASE } from '../api/api-config';

const WAKE = `${B2B_API_BASE}/admin/delivery/road-routing/wake`;

/**
 * **Réveiller le calcul routier** à l'ouverture du Tour manager (2026-11-01,
 * décision de Hugo) : l'instance endormie charge sa carte pendant qu'on lit
 * l'écran, au lieu de le faire au premier « Proposer ».
 *
 * Le serveur répond 202 sans attendre, et borne lui-même les réveils (un par
 * minute). Un échec est SILENCIEUX : rien n'en dépend, « Proposer » attendra
 * le réveil de son côté.
 */
@Injectable({ providedIn: 'root' })
export class RoadRoutingWake {
  private readonly http = inject(HttpClient);

  wake(): void {
    this.http.post(WAKE, null).subscribe({ error: () => undefined });
  }
}

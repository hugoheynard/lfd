import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  FloorClientele,
  PriceLimitsView,
  PriceScopePayload,
  SetPriceFloorPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Les **limites de prix** — ce qui empêche un prix de descendre trop bas, pour
 * les pros comme pour le public.
 *
 * Sorti de `TarificationService` quand les limites ont quitté `b2b_pricing`
 * pour `lfc_price_limits` (plan `documentation/comptabilite/plan-limites-de-prix.md`
 * §5) : un service par droit, pour qu'un écran ne puisse pas appeler un geste
 * que son mur ne couvre pas. Les chemins n'ont pas bougé — seule la garde a
 * changé côté serveur.
 *
 * Chaque geste porte la **clientèle** explicitement. Le serveur vise `pro` quand
 * elle manque, et c'est précisément ce qu'on ne veut pas laisser au défaut
 * depuis un écran qui montre aussi le public.
 */
@Injectable({ providedIn: 'root' })
export class PriceLimitsService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/pricing/floors`;

  /** Les limites en vigueur d'une clientèle. */
  list(clientele: FloorClientele): Promise<PriceLimitsView> {
    return firstValueFrom(
      this.http.get<PriceLimitsView>(this.base, { params: clienteleParams(clientele) }),
    );
  }

  /** Pose la limite. **Idempotent par portée et clientèle** : re-poser remplace. */
  async setFloor(
    payload: SetPriceFloorPayload & { readonly clientele: FloorClientele },
  ): Promise<void> {
    await firstValueFrom(this.http.put<void>(this.base, payload));
  }

  /**
   * **Confirme** une limite sans la changer : l'intention est maintenue, sa
   * référence et sa date repartent d'aujourd'hui.
   *
   * Un geste à part, pas un `PUT` déguisé. Sans lui, la seule façon d'éteindre
   * le signal de dérive serait de MODIFIER la limite — donc de changer une
   * décision pour faire taire un rappel.
   */
  async confirmFloor(scope: PriceScopePayload, clientele: FloorClientele): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${this.base}/${floorPath(scope)}/confirm`,
        {},
        { params: clienteleParams(clientele) },
      ),
    );
  }

  /**
   * **Archive** la limite d'une portée, avec le motif écrit à l'écran.
   *
   * `POST` et non `DELETE` : un `DELETE` ne porte pas de corps de façon fiable à
   * travers les intermédiaires HTTP, et le motif est précisément ce qu'on veut
   * garder.
   */
  async archiveFloor(
    scope: PriceScopePayload,
    clientele: FloorClientele,
    reason: string | null,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post<void>(
        `${this.base}/${floorPath(scope)}/archive`,
        { reason },
        { params: clienteleParams(clientele) },
      ),
    );
  }
}

function clienteleParams(clientele: FloorClientele): HttpParams {
  return new HttpParams().set('clientele', clientele);
}

/**
 * Le chemin d'une limite.
 *
 * La portée globale ne désigne aucune cible, donc le sien n'en porte pas — un
 * segment vide ne s'apparie pas côté serveur.
 */
function floorPath(scope: PriceScopePayload): string {
  return scope.id === null ? 'global' : `${scope.type}/${encodeURIComponent(scope.id)}`;
}

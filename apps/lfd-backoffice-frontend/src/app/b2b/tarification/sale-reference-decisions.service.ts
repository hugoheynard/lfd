import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AmendedMercurialeResponse,
  CarryOverDecisionPayload,
  CarryOverMercurialeLinePayload,
  CreatedIdResponse,
  SaleReferenceDecisionKind,
  SaleReferenceDecisionView,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * La route de report de chaque famille autre que la mercuriale — chacune sous
 * la surface de SA famille (`plan-report-apres-detachement.md`, § 4) : le
 * plancher sous les limites de prix, le reste sous la tarification.
 */
const CARRY_OVER_ROUTES: Readonly<
  Record<Exclude<SaleReferenceDecisionKind, 'mercuriale'>, string>
> = {
  price_rule: 'rules',
  price_floor: 'floors',
  volume_ladder: 'volume-ladders',
  volume_commitment: 'commitments',
  price_template: 'templates',
};

/**
 * **Les décisions tarifaires debout sur une référence de vente**
 * (`plan-pro-voit-les-declinaisons.md`, L7), et le report d'une mercuriale
 * sur la référence née d'un détachement (`plan-tarif-date-sur-une-reference.md`, § 6).
 */
@Injectable({ providedIn: 'root' })
export class SaleReferenceDecisionsService {
  private readonly http = inject(HttpClient);

  standingOn(sku: string): Promise<readonly SaleReferenceDecisionView[]> {
    return firstValueFrom(
      this.http.get<readonly SaleReferenceDecisionView[]>(
        `${B2B_API_BASE}/admin/pricing/sale-references/${encodeURIComponent(sku)}/decisions`,
      ),
    );
  }

  /** Reporte sur `payload.toSku` le prix que `fromSku` porte dans cette mercuriale. */
  carryOver(
    fromSku: string,
    mercurialeId: string,
    payload: CarryOverMercurialeLinePayload,
  ): Promise<AmendedMercurialeResponse> {
    return firstValueFrom(
      this.http.post<AmendedMercurialeResponse>(
        `${B2B_API_BASE}/admin/pricing/sale-references/${encodeURIComponent(fromSku)}/decisions/mercuriales/${encodeURIComponent(mercurialeId)}/carry-over`,
        payload,
      ),
    );
  }

  /**
   * Reporte la décision `id` de `payload.fromSku` sur `payload.toSku` — ou,
   * pour un gabarit, y remplace l'une par l'autre (`plan-report-apres-detachement.md`).
   * La mercuriale garde sa route d'avenant.
   */
  async carryOverDecision(
    kind: SaleReferenceDecisionKind,
    id: string,
    payload: CarryOverDecisionPayload,
  ): Promise<void> {
    if (kind === 'mercuriale') {
      await this.carryOver(payload.fromSku, id, { toSku: payload.toSku, reason: payload.reason });
      return;
    }
    await firstValueFrom(
      this.http.post<CreatedIdResponse>(
        `${B2B_API_BASE}/admin/pricing/${CARRY_OVER_ROUTES[kind]}/${encodeURIComponent(id)}/carry-over`,
        payload,
      ),
    );
  }
}

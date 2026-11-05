import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AdminDeliveryZoneView,
  AudienceDeliveryZoneView,
  CreatedDeliveryZoneResponse,
  DeliveryPricingPatch,
  DeliveryPricingView,
  CustomerAudience,
  DeliveryZonePayload,
  DeliveryZoneView,
  UncoveredPostalCodeView,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';

/**
 * Zones de livraison (code postal → frais). **Lecture** publique (le checkout
 * client en a besoin) ; **écriture** staff (token audience admin). Code postal
 * unique, tenu côté backend.
 */
@Injectable({ providedIn: 'root' })
export class DeliveryZonesService {
  private readonly http = inject(HttpClient);

  /**
   * Liste les zones (par code postal). Route publique. Pour les écrans qui
   * ne lisent que les préfixes et les libellés : le frais servi sans
   * audience est celui des particuliers.
   */
  list(): Promise<readonly DeliveryZoneView[]> {
    return firstValueFrom(
      this.http.get<readonly DeliveryZoneView[]>(`${B2B_API_BASE}/delivery-zones`),
    );
  }

  /**
   * Les zones avec le frais RÉSOLU pour `audience` (plan
   * `plan-livraison-offerte.md`, 0c) — celui que le devis facture. La saisie
   * de commande passe la clientèle du client pour qui l'on commande.
   */
  listFor(audience: CustomerAudience): Promise<readonly AudienceDeliveryZoneView[]> {
    return firstValueFrom(
      this.http.get<readonly AudienceDeliveryZoneView[]>(
        `${B2B_API_BASE}/delivery-zones?audience=${audience}`,
      ),
    );
  }

  /**
   * Les zones AVEC leurs remplacements par audience (staff, plan
   * `plan-livraison-offerte.md`, 0b) — ce que la route publique ne sert pas.
   */
  listAdmin(): Promise<readonly AdminDeliveryZoneView[]> {
    return firstValueFrom(
      this.http.get<readonly AdminDeliveryZoneView[]>(`${B2B_API_BASE}/admin/delivery-zones`),
    );
  }

  /** Le réglage global de livraison par audience (staff, 0b). */
  pricing(): Promise<DeliveryPricingView> {
    return firstValueFrom(
      this.http.get<DeliveryPricingView>(`${B2B_API_BASE}/admin/delivery-pricing`),
    );
  }

  /** Change le réglage global : seules les valeurs présentes changent. Répond `204`. */
  async updatePricing(patch: DeliveryPricingPatch): Promise<void> {
    await firstValueFrom(this.http.patch<void>(`${B2B_API_BASE}/admin/delivery-pricing`, patch));
  }

  /** Les codes postaux d'adresses de livraison qu'aucune zone ne couvre (staff). */
  uncoveredPostalCodes(): Promise<readonly UncoveredPostalCodeView[]> {
    return firstValueFrom(
      this.http.get<readonly UncoveredPostalCodeView[]>(
        `${B2B_API_BASE}/admin/delivery-zones/uncovered-postal-codes`,
      ),
    );
  }

  /** Crée une zone (staff). */
  async create(payload: DeliveryZonePayload): Promise<CreatedDeliveryZoneResponse> {
    return firstValueFrom(
      this.http.post<CreatedDeliveryZoneResponse>(`${B2B_API_BASE}/admin/delivery-zones`, payload),
    );
  }

  /** Édite une zone (staff). */
  async update(id: string, payload: DeliveryZonePayload): Promise<void> {
    await firstValueFrom(
      this.http.patch<void>(`${B2B_API_BASE}/admin/delivery-zones/${id}`, payload),
    );
  }

  /** Supprime une zone (staff). */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${B2B_API_BASE}/admin/delivery-zones/${id}`));
  }
}

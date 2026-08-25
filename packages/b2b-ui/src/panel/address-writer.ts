import { InjectionToken } from '@angular/core';
import type { BillingAddressPayload, DeliveryAddressPayload } from '@lfd/contracts';

/**
 * L'**écriture** d'une adresse d'entreprise — tout ce que les panneaux de ce
 * paquet ont besoin de savoir de l'API.
 *
 * C'est le seul endroit où client et staff diffèrent réellement : le client
 * écrit sur `/companies/:id/…`, muré par son adhésion à l'entreprise ; le
 * commercial écrit sur `/admin/companies/:id/…`, authentifié comme staff et
 * sans mur — il n'est membre de rien. Le geste, les champs, la validation et
 * les libellés sont les mêmes ; seul le chemin change. Un port le dit ; un
 * drapeau `isAdmin` dans le panneau l'aurait caché.
 *
 * Les méthodes rendent une promesse et **rejettent** en cas d'échec : c'est
 * `panelSubmit()` qui annonce et qui décide de fermer.
 *
 * ## Pourquoi ce token vit sous `panel/` et non sous `company/`
 *
 * Parce qu'un `app.config.ts` doit le lire pour le fournir, et qu'un import
 * traverse le barrel de son sous-chemin. Depuis `@lfd/b2b-ui/company`, ce seul
 * token tirait les cartes, les panneaux et leurs formulaires dans le bundle
 * INITIAL de l'app : `main` passait de 137 ko à 559 ko, et le budget de build
 * sautait. Un token de câblage appartient donc au sous-chemin le plus maigre
 * qui le porte.
 */
export interface AddressWriter {
  /** Pose ou corrige l'adresse de facturation (unique). */
  saveBilling(companyId: string, payload: BillingAddressPayload): Promise<unknown>;
  /** Ajoute une adresse de livraison. */
  addDelivery(companyId: string, payload: DeliveryAddressPayload): Promise<unknown>;
  /** Corrige une adresse de livraison existante. */
  updateDelivery(
    companyId: string,
    addressId: string,
    payload: DeliveryAddressPayload,
  ): Promise<unknown>;
}

/** Le service d'écriture d'adresses de l'app hôte. */
export const ADDRESS_WRITER = new InjectionToken<AddressWriter>('ADDRESS_WRITER');

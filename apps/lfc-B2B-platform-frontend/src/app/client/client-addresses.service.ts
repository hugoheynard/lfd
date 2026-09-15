import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type {
  BillingAddressPayload,
  BillingAddressView,
  CompanyAddressesView,
  DeliveryAddressPayload,
  DeliveryAddressView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { firstValueFrom, type Observable } from 'rxjs';

import { AccountService } from '../account/account.service';
import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientActivation } from './client-activation.service';

/**
 * **Le carnet d'adresses du client**, tel que notre base le porte.
 *
 * 🔴 **Il était écrit en dur** (`SAVED_ADDRESSES` : « Le Chalet », « Bureau »).
 * C'était la plus dangereuse des maquettes restantes, et pour une raison que les
 * autres n'avaient pas : une adresse d'exemple posée à côté d'une commande
 * réelle est **une livraison à la mauvaise porte**. Le nom d'un point de retrait
 * faux se corrige au téléphone ; un carton déposé chez quelqu'un d'autre, non.
 *
 * ## Ce qu'il montre, et à qui
 *
 * Les adresses de l'entreprise du demandeur (`GET /companies/:id/addresses`),
 * lues seulement une fois quelqu'un reconnu. **Rien pour un visiteur anonyme** :
 * il n'a pas de carnet, il saisit son adresse, et c'est vrai. Un carnet de
 * démonstration lui proposerait celui d'un autre.
 *
 * ⚠️ Un échec de lecture laisse le carnet **vide**, jamais rempli d'exemples :
 * l'écran retombe alors sur la saisie libre, qui fonctionne toujours.
 *
 * ## Quelle entreprise
 *
 * La première de `GET /me`. La boutique n'a pas encore de sélecteur
 * d'entreprise — elle commande à titre personnel (`companyId: null`), et le
 * carnet n'est ici qu'une commodité de saisie, pas le titulaire de la commande.
 * C'est exactement ici que ce sélecteur se branchera le jour où il existera.
 */
@Injectable({ providedIn: 'root' })
export class ClientAddresses {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly account = inject(AccountService);
  private readonly activation = inject(ClientActivation);

  private readonly known = signal<CompanyAddressesView | null>(null);

  /** Ce que l'entreprise a déclaré, la défaut en tête (le serveur la trie). */
  readonly deliveries = computed<readonly DeliveryAddressView[]>(
    () => this.known()?.deliveries ?? [],
  );

  /** L'adresse de facturation, ou `null` — l'entreprise n'en a pas encore posé. */
  readonly billing = computed<BillingAddressView | null>(() => this.known()?.billing ?? null);

  /** L'entreprise déjà lue : sans ce garde, l'effet rechargerait à chaque signal. */
  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      const company = this.account.companies()[0] ?? null;
      if (company === null || company.id === this.loadedFor) {
        return;
      }
      this.loadedFor = company.id;
      void this.load(company.id);
    });
  }

  /**
   * Pose un carnet déjà obtenu, et considère la lecture faite.
   *
   * Publique pour les suites : elles posent les adresses au lieu de doubler ce
   * dépôt, ce qui les fait passer par le VRAI code — le même tri, la même
   * dérivation du complément.
   */
  receive(addresses: CompanyAddressesView | null): void {
    this.known.set(addresses);
    this.loadedFor = 'posé-par-la-suite';
  }

  /**
   * `PATCH /companies/:id/billing-address` — pose ou remplace la facturation,
   * puis relit le carnet. `null` au succès, le **message du serveur** au refus
   * (écriture réservée à `owner`/`admin`, vérifié le 2026-09-14 dans
   * `company-addresses.controller.ts`).
   *
   * Seule écriture du carnet qui relit AUSSI le verdict d'activation : il lit
   * la facturation, jamais les livraisons (vérifié le 2026-09-15,
   * `activation-gate.ts`). La relecture ne part que si le verdict a été lu.
   */
  async saveBilling(companyId: string, payload: BillingAddressPayload): Promise<string | null> {
    const refusal = await this.write(companyId, (headers) =>
      this.http.patch(`${this.url(companyId)}/billing-address`, payload, { headers }),
    );
    if (refusal === null) {
      await this.activation.refresh(companyId);
    }
    return refusal;
  }

  /** `POST /companies/:id/delivery-addresses` — même contrat que {@link saveBilling}. */
  addDelivery(companyId: string, payload: DeliveryAddressPayload): Promise<string | null> {
    return this.write(companyId, (headers) =>
      this.http.post(`${this.url(companyId)}/delivery-addresses`, payload, { headers }),
    );
  }

  /** `PATCH /companies/:id/delivery-addresses/:addressId` — même contrat que {@link saveBilling}. */
  updateDelivery(
    companyId: string,
    addressId: string,
    payload: DeliveryAddressPayload,
  ): Promise<string | null> {
    return this.write(companyId, (headers) =>
      this.http.patch(`${this.url(companyId)}/delivery-addresses/${addressId}`, payload, {
        headers,
      }),
    );
  }

  /**
   * `DELETE /companies/:id/delivery-addresses/:addressId` — archive une
   * livraison. Même contrat que {@link saveBilling}.
   *
   * La relecture compte plus qu'ailleurs : si l'archivée était la défaut, c'est
   * le SERVEUR qui promeut sa remplaçante (vérifié le 2026-09-14,
   * `remove-delivery-address.handler.ts`), et l'écran ne peut pas la deviner.
   */
  removeDelivery(companyId: string, addressId: string): Promise<string | null> {
    return this.write(companyId, (headers) =>
      this.http.delete(`${this.url(companyId)}/delivery-addresses/${addressId}`, { headers }),
    );
  }

  /**
   * `PATCH /companies/:id/delivery-addresses/:addressId/default` — désigne la
   * livraison par défaut. La route ne lit aucun corps. Même contrat que
   * {@link saveBilling}.
   */
  makeDefaultDelivery(companyId: string, addressId: string): Promise<string | null> {
    return this.write(companyId, (headers) =>
      this.http.patch(`${this.url(companyId)}/delivery-addresses/${addressId}/default`, null, {
        headers,
      }),
    );
  }

  /**
   * Écrit, puis relit le carnet : c'est la relecture qui fait apparaître
   * l'adresse, avec le tri du serveur (la défaut en tête), pas une insertion
   * locale qui pourrait s'en écarter.
   */
  private async write(
    companyId: string,
    call: (headers: HttpHeaders) => Observable<unknown>,
  ): Promise<string | null> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      await firstValueFrom(call(new HttpHeaders({ Authorization: `Bearer ${token}` })));
    } catch (error) {
      return httpErrorMessage(error);
    }
    await this.load(companyId);
    return null;
  }

  private url(companyId: string): string {
    return `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}`;
  }

  private async load(companyId: string): Promise<void> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      this.known.set(
        await firstValueFrom(
          this.http.get<CompanyAddressesView>(`${this.url(companyId)}/addresses`, {
            headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
          }),
        ),
      );
    } catch {
      // Vide, et relisible : l'écran retombe sur la saisie libre, qui marche.
      this.loadedFor = null;
    }
  }
}

/**
 * Le **complément** d'une adresse — « au Chalet », « au Bureau ».
 *
 * ⚠️ Dérivé du libellé, faute de source : `DeliveryAddressView` n'en porte pas.
 * C'est la même dette de contrat que pour les points de retrait, et elle a la
 * même conséquence — « au Villa » pour un lieu féminin. Une dette de CONTRAT, à
 * régler par un champ, pas par une règle de grammaire côté écran.
 */
export function addressAt(label: string): string {
  return label.trim() === '' ? 'à cette adresse' : `au ${label}`;
}

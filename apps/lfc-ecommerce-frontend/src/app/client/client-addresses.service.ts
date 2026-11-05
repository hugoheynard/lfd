import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type {
  BillingAddressPayload,
  BillingAddressView,
  CompanyAddressesView,
  DeliveryAddressPayload,
  DeliveryAddressView,
  MemberDeliveryAddressPayload,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import { PERSONAL_WORKSPACE } from '@lfd/contracts/workspace';
import { firstValueFrom, type Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';
import { ClientActivation } from './client-activation.service';
import { ClientContext, VISITOR } from './client-context.service';
import { contextKeyed, type ContextKey, workspaceRequestOf } from './context-keyed/context-keyed';

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
 * Celle de l'**espace qui s'affiche** (`ClientContext.prefix()`), et rien en
 * perso : une adresse appartient à une société, et en proposer une à qui
 * commande pour lui-même serait livrer chez son employeur. Le carnet
 * **attend** l'espace connu, et ne montre jamais, pendant une bascule, celui
 * de la maison quittée (lot d de `caching-usage/plan-espace-retenu.md`).
 */
@Injectable({ providedIn: 'root' })
export class ClientAddresses {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);
  private readonly context = inject(ClientContext);
  private readonly activation = inject(ClientActivation);

  /** Avance à chaque réponse : la brique n'est pas un signal. */
  private readonly answered = signal(0);

  /** Le carnet posé à la main par une suite, `undefined` sinon. */
  private readonly received = signal<CompanyAddressesView | null | undefined>(undefined);

  /**
   * Le carnet, rangé par clé de contexte : l'espace d'une société EST son
   * identifiant, et rien n'est rendu pour un autre espace que celui qui
   * s'affiche — une réponse arrivée après une bascule reste rangée sous sa
   * maison, elle ne s'affiche pas sous la suivante.
   */
  private readonly keyed = contextKeyed((key) => this.read(key));

  /** La société de l'espace qui s'affiche, `null` en perso, en visite ou avant `/me`. */
  private readonly shownCompany = computed<string | null>(() => companyOf(this.context.prefix()));

  private readonly known = computed<CompanyAddressesView | null>(() => {
    const received = this.received();
    if (received !== undefined) {
      return received;
    }
    this.answered();
    const company = this.shownCompany();
    return company === null ? null : (this.keyed.shown(keyOf(company)) ?? null);
  });

  /** Ce que l'entreprise a déclaré, la défaut en tête (le serveur la trie). */
  readonly deliveries = computed<readonly DeliveryAddressView[]>(
    () => this.known()?.deliveries ?? [],
  );

  /** L'adresse de facturation, ou `null` — l'entreprise n'en a pas encore posé. */
  readonly billing = computed<BillingAddressView | null>(() => this.known()?.billing ?? null);

  constructor() {
    // Une lecture par société affichée : `ensure` ne relance pas une clé déjà
    // lue ou en vol.
    effect(() => {
      const company = this.shownCompany();
      if (company !== null && this.received() === undefined) {
        void this.settle(this.keyed.ensure(keyOf(company)));
      }
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
    this.received.set(addresses);
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
    // La charge du membre : celle de toute livraison, plus « dépôt autorisé »
    // facultatif — absent, le serveur le laisse tel quel (AP-D5).
    payload: MemberDeliveryAddressPayload,
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
   * Relit le carnet d'une société. Pour ce qui change une adresse sans passer
   * par ce service — la procédure de livraison écrit par sa propre passerelle,
   * et c'est ici que se lit son nombre d'étapes (`procedureStepCount`).
   */
  refresh(companyId: string): Promise<void> {
    return this.load(companyId);
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

  /** Relit le carnet d'une société ; un échec le laisse tel quel, et relisible. */
  private async load(companyId: string): Promise<void> {
    if (this.received() !== undefined) {
      this.received.set(undefined);
    }
    await this.settle(this.keyed.read(keyOf(companyId)));
  }

  /** Attend une lecture : un échec laisse vide, l'écran retombe sur la saisie libre. */
  private async settle(reading: Promise<CompanyAddressesView>): Promise<void> {
    try {
      await reading;
    } catch {
      // Vide, et relisible : l'écran retombe sur la saisie libre, qui marche.
    }
    this.answered.update((count) => count + 1);
  }

  /** L'appel — l'en-tête d'espace vient de la clé, pas de l'envoi. */
  private read(key: ContextKey): Observable<CompanyAddressesView> {
    return this.auth
      .accessToken$()
      .pipe(
        switchMap((token) =>
          this.http.get<CompanyAddressesView>(
            `${this.url(key.workspace)}/addresses`,
            workspaceRequestOf(key, { Authorization: `Bearer ${token}` }),
          ),
        ),
      );
  }
}

/** La société d'un préfixe d'espace, `null` pour le perso, le visiteur ou l'inconnu. */
function companyOf(prefix: string | null): string | null {
  return prefix === null || prefix === VISITOR || prefix === PERSONAL_WORKSPACE ? null : prefix;
}

/** La clé d'une société : son espace, sans part propre. */
function keyOf(companyId: string): ContextKey {
  return { workspace: companyId, own: '' };
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

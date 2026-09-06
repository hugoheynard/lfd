import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { BillingAddressView, CompanyAddressesView, DeliveryAddressView } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { AccountService } from '../account/account.service';
import { AUTH_CONFIG } from '../auth/auth.config';
import { AuthFacade } from '../auth/auth.facade';

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

  private async load(companyId: string): Promise<void> {
    try {
      const token = await firstValueFrom(this.auth.accessToken$());
      this.known.set(
        await firstValueFrom(
          this.http.get<CompanyAddressesView>(
            `${AUTH_CONFIG.apiBaseUrl}/companies/${companyId}/addresses`,
            { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) },
          ),
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

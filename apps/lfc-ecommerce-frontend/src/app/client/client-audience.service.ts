import { computed, inject, Injectable } from '@angular/core';
// Par le sous-chemin sans zod : chargé au démarrage (budget `cloudflare`).
import {
  audienceOf,
  type CustomerAudience,
  pickupAnnouncementOf,
} from '@lfd/contracts/shop-values';

import { AuthFacade } from '../auth/auth.facade';
import { ClientWorkspace } from './client-workspace.service';

/**
 * **La clientèle de l'écran** — les pros (`b2b`) ou les particuliers (`b2c`).
 *
 * Elle règle ce que la boutique ANNONCE : la remise d'un point de retrait, la
 * livraison proposée (`documentation/livraisons/clientele/plan-remise-et-livraison-par-clientele.md`,
 * D1 et D7). Le serveur, lui, DÉCIDE — il relit la société agissante au devis
 * comme à la commande. Ce service n'a donc aucun pouvoir : il évite seulement
 * d'afficher une remise que la caisse refusera.
 *
 * B2B pour une société **active** ou **suspendue** (Hugo, 2026-09-15, Q3 ;
 * la suspendue depuis le 2026-11-03, `plan-suspendue-au-prix-pro.md`) : un
 * visiteur, l'espace perso et une société `pending` ou `terminated` sont B2C. La règle est `audienceOf`, la MÊME que le serveur lit —
 * ce service ne fait que lui passer le statut de l'espace courant.
 *
 * Un seul endroit la calcule : deux écrans qui la déduiraient chacun finiraient
 * par ne pas voir le même client.
 */
@Injectable({ providedIn: 'root' })
export class ClientAudience {
  private readonly auth = inject(AuthFacade);
  private readonly workspace = inject(ClientWorkspace);

  /**
   * La clientèle, ou `null` quand elle n'est pas encore connue : un client
   * reconnu dont `/me` n'a pas répondu.
   *
   * Ce `null` compte pour qui EFFACE : retirer une livraison gardée parce
   * qu'un pro a été pris pour un particulier le temps d'une requête ferait
   * perdre un choix légitime.
   */
  readonly current = computed<CustomerAudience | null>(() => {
    if (!this.auth.isAuthenticated()) {
      return 'b2c';
    }
    if (this.workspace.current() === null) {
      return null;
    }
    return audienceOf(this.workspace.company()?.status ?? null);
  });

  /**
   * Ce que l'écran montre : la clientèle connue, B2C tant qu'elle ne l'est pas.
   *
   * B2C par défaut plutôt que B2B : annoncer une remise pro à qui n'y a pas
   * droit est une promesse que la caisse retire ; ne pas l'annoncer une seconde
   * de trop n'en retire aucune.
   */
  readonly shown = computed<CustomerAudience>(() => this.current() ?? 'b2c');

  /**
   * **Servi en pro par la caisse** : une société active, ou EN ATTENTE
   * (`companyServiceOf`) — ce qui fait dire « Prix pro » plutôt que « Prix
   * boutique » à un point sans remise.
   *
   * Ce n'est plus une clé d'annonce (2026-10-31, Hugo : « chaque audience n'a
   * le droit qu'à son information ») : le serveur rend déjà, sur chaque
   * point, la seule remise de qui regarde. Tant que l'espace n'est pas connu,
   * les particuliers — la même prudence que {@link shown}.
   */
  readonly servedAsPro = computed<boolean>(() => {
    if (!this.auth.isAuthenticated() || this.current() === null) {
      return false;
    }
    // La règle partagée avec le serveur : toute annonce autre que celle des
    // particuliers est celle d'une société servie en pro.
    return pickupAnnouncementOf(this.workspace.company()?.status ?? null) !== 'b2c';
  });
}

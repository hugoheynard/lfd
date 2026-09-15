import { computed, inject, Injectable } from '@angular/core';
// Par le sous-chemin sans zod : chargé au démarrage (budget `cloudflare`).
import { audienceOf, type CustomerAudience } from '@lfd/contracts/shop-values';

import { AuthFacade } from '../auth/auth.facade';
import { ClientWorkspace } from './client-workspace.service';

/**
 * **La clientèle de l'écran** — les pros (`b2b`) ou les particuliers (`b2c`).
 *
 * Elle règle ce que la boutique ANNONCE : la remise d'un point de retrait, la
 * livraison proposée (`documentation/b2b/plan-remise-et-livraison-par-clientele.md`,
 * D1 et D7). Le serveur, lui, DÉCIDE — il relit la société agissante au devis
 * comme à la commande. Ce service n'a donc aucun pouvoir : il évite seulement
 * d'afficher une remise que la caisse refusera.
 *
 * B2B seulement pour une société **active** (Hugo, 2026-09-15, Q3) : un
 * visiteur, l'espace perso et une société `pending`, `suspended` ou
 * `terminated` sont B2C. La règle est `audienceOf`, la MÊME que le serveur lit —
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
}

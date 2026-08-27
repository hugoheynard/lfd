import { computed, Injectable, signal } from '@angular/core';

import type { UserProfile } from '../account/account.model';
import { MOCK_CLIENT } from './mock-client';

/**
 * Qui est le client, pour les écrans qui le NOMMENT.
 *
 * Le profil vient de chez nous (`GET /me`) : Auth0 authentifie, le backend
 * provisionne l'utilisateur au vol, et c'est notre base qui porte prénom, nom et
 * téléphone. Cette classe ne va PAS le chercher elle-même — c'est
 * {@link ClientOnboarding} qui l'y verse, depuis le shell.
 *
 * Ce détour n'est pas une politesse d'architecture : lire le compte demande
 * `HttpClient` et Auth0, et un écran qui dit « Bonjour Pierre » n'a aucune
 * raison de les traîner. Ici il lit trois signaux, et rien d'autre.
 *
 * Tant que personne n'est reconnu — visiteur, compte pas encore chargé — ce sont
 * les valeurs de la maquette qui répondent. La démo reste jouable déconnecté, et
 * le vrai nom prend la place dès qu'il est connu.
 */
@Injectable({ providedIn: 'root' })
export class ClientIdentity {
  private readonly known = signal<UserProfile | null>(null);

  readonly firstName = computed(() => blank(this.known()?.firstName) ?? MOCK_CLIENT.firstName);

  readonly lastName = computed(() => blank(this.known()?.lastName) ?? '');

  /** Le nom complet, sans espace en trop quand le nom de famille manque. */
  readonly fullName = computed(() => `${this.firstName()} ${this.lastName()}`.trim());

  readonly phone = computed(() => blank(this.known()?.phone) ?? MOCK_CLIENT.phone);

  readonly email = computed(() => blank(this.known()?.email) ?? MOCK_CLIENT.email);

  /** Le compte relu : le shell l'y verse dès que `GET /me` a répondu. */
  apply(profile: UserProfile | null): void {
    this.known.set(profile);
  }
}

/**
 * Un champ vide n'est pas une réponse.
 *
 * Le compte naît avec un nom et un téléphone VIDES — le backend provisionne
 * avant que `/bienvenue` n'ait reposé quoi que ce soit. Sans cette garde,
 * l'écran dirait « Bonjour  » pendant ce battement.
 */
function blank(value: string | undefined): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}

import type { UserProfile } from "../entities/user-profile.js";

/**
 * Le profil tel que la persistance le rend. Aucune colonne système : le domaine
 * ne connaît ni `created_at` ni `updated_at`.
 */
export interface UserProfileRecord {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
}

/**
 * Port d'**écriture** du profil. Séparé de la lecture (`AccountReader`) : un
 * handler d'écriture n'a aucun besoin de savoir agréger les sociétés, et un
 * handler de lecture n'a aucun besoin de pouvoir écrire (ISP).
 *
 * Classe abstraite et non `interface` : elle sert aussi de **token d'injection**
 * Nest, ce qui évite un symbole séparé à maintenir en parallèle du type.
 */
export abstract class UserProfileRepository {
  abstract findById(userId: string): Promise<UserProfileRecord | null>;

  /**
   * Identifiant du compte portant cet e-mail, `null` si libre. Sert à refuser un
   * changement d'e-mail vers une adresse déjà prise — l'unicité `auth0_sub` ne
   * couvre pas l'e-mail.
   */
  abstract findIdByEmail(email: string): Promise<string | null>;

  /**
   * Persiste le profil.
   *
   * Quand {@link UserProfile.emailChanged} est vrai, la vérification de
   * l'adresse retombe à `false` **dans la même écriture** que la nouvelle
   * adresse (2026-09-14) : deux écritures laisseraient une fenêtre où l'adresse
   * neuve passe pour prouvée. Une adresse inchangée ne touche jamais à la
   * vérification — pas même pour la réécrire à sa valeur lue, ce qui effacerait
   * une preuve recopiée entre-temps par une connexion.
   */
  abstract save(userId: string, profile: UserProfile): Promise<void>;
}

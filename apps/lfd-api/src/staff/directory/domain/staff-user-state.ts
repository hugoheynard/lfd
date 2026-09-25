import type { StaffStatus } from "@lfd/contracts";

import type { OverrideDiff } from "./override-diff.js";

/**
 * Ce qu'une fiche dit d'une personne **hors dérogations** — les colonnes qu'un
 * formulaire d'édition réécrit. L'e-mail y est déjà normalisé.
 */
export interface StaffUserIdentity {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly jobTitle: string;
  /**
   * La clé du rôle — une chaîne, plus l'union `StaffRole` : un rôle créé à
   * l'écran s'attribue (plan `plan-roles-lus-en-base.md` §3.5).
   */
  readonly role: string;
}

/**
 * L'état complet d'une fiche **avant** une mutation.
 *
 * Il sort du dépôt parce que les faits du journal en ont besoin : « un fait
 * par changement réel » demande de savoir ce qui était là (plan
 * `plan-journal-de-l-annuaire.md` §5). Il ne porte **aucun** `sub` vers le
 * journal — `auth0Id` n'est là que pour la propagation d'adresse.
 */
export interface StaffUserSnapshot extends StaffUserIdentity {
  readonly id: string;
  readonly status: StaffStatus;
  readonly auth0Id: string | null;
}

/** Ce qu'une édition a réellement fait : avant, après, et le diff des écarts. */
export interface StaffUserEdit {
  readonly before: StaffUserSnapshot;
  readonly after: StaffUserIdentity;
  readonly overrides: OverrideDiff;
  /**
   * Les libellés des deux rôles, lus dans leurs définitions au moment de
   * l'écriture : le journal les fige (« des libellés figés, jamais des clés
   * seules »), et le domaine ne connaît plus la table des libellés.
   */
  readonly roleLabels: { readonly before: string; readonly after: string };
}

/** Une fiche créée : son id, et le libellé du rôle attribué, pour le journal. */
export interface StaffUserCreated {
  readonly id: string;
  readonly roleLabel: string;
}

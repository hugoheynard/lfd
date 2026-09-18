import type { StaffRole, StaffStatus } from "@lfd/contracts";

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
  readonly role: StaffRole;
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
}

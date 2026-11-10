/**
 * Query : la personne connectée peut-elle commander, sous la société qu'elle
 * représente (2026-10-26) ? `companyId` est celle du contexte, résolue en base
 * depuis ses rattachements ; `null` = espace perso. `userId` vient du `Principal`.
 */
export class GetMyOrderAdmissionQuery {
  constructor(
    readonly companyId: string | null,
    readonly userId: string,
  ) {}
}

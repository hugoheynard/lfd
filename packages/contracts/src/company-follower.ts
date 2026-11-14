import { z } from "zod";

/**
 * **Confier le suivi commercial** d'une fiche (`PUT /admin/companies/:id/follower`,
 * droit `b2b_sales_oversight:write`) : la personne de l'équipe qui la suit, ou
 * `null` pour retirer le suiveur. Qu'elle existe et soit active, que la fiche
 * ne soit pas un site, c'est le serveur qui le juge.
 */
export const assignCompanyFollowerPayloadSchema = z.strictObject({
  followerStaffId: z.string().trim().min(1).nullable(),
});
export type AssignCompanyFollowerPayload = z.infer<typeof assignCompanyFollowerPayloadSchema>;

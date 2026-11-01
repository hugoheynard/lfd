import { CustomerRole } from "../../platform/database/client/client.js";
import type { ClientContext } from "./client.seed.js";

/** Le préfixe des personnes que le semis crée — elles ne se connectent jamais. */
const SEEDED_SUB_PREFIX = "seed|";

/**
 * **Les fondateurs semés sont des fondateurs acceptés.**
 *
 * Créer une société pose le rattachement de son créateur en INVITATION
 * (`accepted_at` nul) ; c'est sa requête suivante, résolue par
 * `customer-principal.resolver.ts`, qui l'accepte. Une personne semée ne fait
 * jamais de requête : son rattachement expirait sept jours après le semis, et
 * la remise à l'état de base tombait alors sur « Entreprise introuvable »
 * (constaté le 2026-11-01, semis du 2026-10-25, 37 rattachements).
 *
 * L'acceptation est datée de l'instant du semis, et ne vise que les
 * rattachements `owner` des personnes semées : une invitation semée exprès
 * pour montrer l'attente garde son état. Idempotente : un rattachement
 * accepté n'est plus touché.
 */
export async function acceptSeededFounders({
  prisma,
  now,
}: Pick<ClientContext, "prisma" | "now">): Promise<number> {
  const { count } = await prisma.membership.updateMany({
    where: {
      acceptedAt: null,
      role: CustomerRole.owner,
      user: { auth0Sub: { startsWith: SEEDED_SUB_PREFIX } },
    },
    data: { acceptedAt: now },
  });
  return count;
}

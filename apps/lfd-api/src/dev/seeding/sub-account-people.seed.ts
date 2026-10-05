import { UpdateMyProfileCommand } from "../../b2b/account/application/commands/update-my-profile.command.js";
import { runWithRequestContext } from "../../platform/context/request-context.store.js";
import { newTraceId } from "../../platform/context/trace-context.js";
import { CustomerRole, UserStatus } from "../../platform/database/client/client.js";
import type { ClientContext } from "./client.seed.js";

/**
 * **Les personnes des sous-comptes** — une gouvernante par chalet.
 *
 * Même entorse que le client de référence et ses voisins, et pour la même
 * raison : la personne s'écrit en base parce qu'aucune commande ne crée un
 * utilisateur sans jeton vérifié. Son PROFIL passe par sa commande.
 *
 * Le rattachement au chalet est direct lui aussi, comme
 * `seedImpersonatedAccess` (`client.seed.ts`) : `InviteCompanyMemberCommand`
 * ouvre un accès chez le fournisseur d'identité et envoie un courriel, ce
 * qu'un semis local ne doit pas faire.
 */
export interface SeedPerson {
  readonly auth0Sub: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
}

/** La personne, créée si elle manque, et son profil reposé par sa commande. */
export async function ensurePerson(
  { prisma, commands, now }: ClientContext,
  person: SeedPerson,
): Promise<string> {
  const userId =
    (await prisma.user.findUnique({ where: { auth0Sub: person.auth0Sub } }))?.id ??
    (
      await prisma.user.create({
        data: { auth0Sub: person.auth0Sub, email: person.email, status: UserStatus.active },
        select: { id: true },
      })
    ).id;
  await asCustomer(now, userId, () =>
    commands.execute(
      new UpdateMyProfileCommand(
        userId,
        person.auth0Sub,
        person.firstName,
        person.lastName,
        person.email,
        person.phone,
      ),
    ),
  );
  return userId;
}

/** Rattache la personne à la société en `admin`, si elle ne l'est pas déjà. */
export async function ensureAdminMembership(
  { prisma }: ClientContext,
  userId: string,
  companyId: string,
): Promise<void> {
  const existing = await prisma.membership.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: { id: true },
  });
  if (existing === null) {
    await prisma.membership.create({ data: { userId, companyId, role: CustomerRole.admin } });
  }
}

/** Le contexte de requête d'un geste du client lui-même. */
export function asCustomer<T>(now: Date, userId: string, run: () => Promise<T>): Promise<T> {
  return runWithRequestContext(
    { now, traceId: newTraceId(), actor: { type: "customer", id: userId } },
    run,
  );
}

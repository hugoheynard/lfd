import { Injectable } from "@nestjs/common";

import { UserStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TakenContact } from "../domain/errors/particular-errors.js";
import { ParticularRegistry, type ParticularHolder } from "../domain/ports/particular-registry.js";
import type { ParticularIdentity } from "../domain/value-objects/particular-identity.js";
import { PARTICULAR_WHERE, PHONE_KEY } from "./particular-sql.js";

interface HolderRow {
  readonly id: string;
  readonly first_name: string;
  readonly same_email: boolean;
}

/**
 * Adaptateur de l'inscription des particuliers au comptoir.
 *
 * Le doublon se cherche par **égalité** sur des formes normalisées — adresse en
 * minuscules sans blancs, clé du téléphone —, jamais par motif : aucun `ILIKE`,
 * donc aucun `_` qui vaudrait n'importe quelle lettre. La fiche la plus
 * ancienne est nommée quand plusieurs répondent.
 */
@Injectable()
export class PrismaParticularRegistry extends ParticularRegistry {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async holderOf(identity: ParticularIdentity): Promise<ParticularHolder | null> {
    const email = identity.email.value;
    const [row] = await this.prisma.$queryRaw<readonly HolderRow[]>`
      SELECT u.id, u.first_name, (lower(btrim(u.email)) = ${email}) AS same_email
      FROM public.users u
      WHERE ${PARTICULAR_WHERE}
        AND (lower(btrim(u.email)) = ${email} OR ${PHONE_KEY} = ${identity.phoneKey})
      ORDER BY same_email DESC, u.created_at, u.id
      LIMIT 1
    `;
    if (row === undefined) {
      return null;
    }
    const taken: TakenContact = row.same_email ? "email" : "phone";
    return { id: row.id, firstName: row.first_name, taken };
  }

  async register(identity: ParticularIdentity, registeredBy: string): Promise<string> {
    // Une fiche invitée : sans `auth0Sub`, se connecter lui est inexprimable ;
    // `status: active` parce qu'il n'y a aucun accès à ouvrir, et l'adresse
    // n'est pas prouvée.
    const created = await this.prisma.user.create({
      data: {
        email: identity.email.value,
        firstName: identity.firstName.value,
        lastName: "",
        phone: identity.phone.value,
        status: UserStatus.active,
        emailVerified: false,
        invitedBy: registeredBy,
      },
      select: { id: true },
    });
    return created.id;
  }
}

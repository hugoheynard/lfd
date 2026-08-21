import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ActivityActorType } from "../domain/activity-event.js";
import { STAFF_ROLE_LABELS } from "@lfd/contracts";

import { ActorNamer, type ActorIdentity } from "../domain/ports/actor-namer.js";

/**
 * Résout le nom d'un acteur au moment de l'acte : la fiche staff pour un `sub`
 * (jointure par `auth0Id`), le profil pour un client.
 *
 * Une lecture par événement journalisé, et c'est assumé : la remplacer par une
 * jointure à l'affichage supposerait que le nom d'aujourd'hui vaut pour l'acte
 * d'hier — or c'est précisément ce qu'une trace ne doit pas faire. Le coût est
 * borné (une clé unique indexée) et payé sur le chemin d'écriture, qui est déjà
 * best-effort.
 */
@Injectable()
export class PrismaActorNamer extends ActorNamer {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async describe(type: ActivityActorType, id: string | null): Promise<ActorIdentity> {
    if (id === null || id.trim() === "") {
      return NOBODY;
    }
    if (type === "staff") {
      const staff = await this.prisma.staffUser.findUnique({
        where: { auth0Id: id },
        select: { firstName: true, lastName: true, role: true },
      });
      return staff === null
        ? NOBODY
        : {
            name: fullName(staff.firstName, staff.lastName),
            // Le LIBELLÉ, pas la clé : « Commercial » se relit dans six mois,
            // même si le rôle a été renommé entre-temps.
            role: STAFF_ROLE_LABELS[staff.role],
          };
    }
    if (type === "customer") {
      const user = await this.prisma.user.findUnique({
        where: { id },
        select: { firstName: true, lastName: true, email: true },
      });
      if (user === null) {
        return NOBODY;
      }
      // L'e-mail en secours : un client sans profil complet reste identifiable,
      // et c'est sous cette forme qu'on le retrouve dans le reste de l'app.
      const name = fullName(user.firstName, user.lastName);
      // Pas de « fonction » pour un client : il n'en a pas dans le back-office.
      return { name: name === "" ? user.email : name, role: null };
    }
    return NOBODY;
  }
}

/** Ni nom ni fonction — l'annuaire ne connaît pas cet acteur. */
const NOBODY: ActorIdentity = { name: null, role: null };

function fullName(firstName: string | null, lastName: string | null): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim();
}

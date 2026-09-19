import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import type { ActivityActorType } from "../domain/activity-event.js";
import { STAFF_ROLE_LABELS } from "@lfd/contracts";

import { ActorNamer, type ActorIdentity } from "../domain/ports/actor-namer.js";

/**
 * Résout le nom d'un acteur au moment de l'acte : la fiche staff par le port
 * d'auteurs du bloc staff — id de fiche, `sub` actuel ou `sub` ancien (
 * `architecture-journalisation.md` §12, D4) —, le profil pour un client
 * (son nom seulement, jamais son adresse).
 *
 * Une lecture par événement journalisé, et c'est assumé : la remplacer par une
 * jointure à l'affichage supposerait que le nom d'aujourd'hui vaut pour l'acte
 * d'hier — or c'est précisément ce qu'une trace ne doit pas faire. Le coût est
 * borné (une clé unique indexée) et payé sur le chemin d'écriture, qui est déjà
 * best-effort.
 */
@Injectable()
export class PrismaActorNamer extends ActorNamer {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {
    super();
  }

  async describe(type: ActivityActorType, id: string | null): Promise<ActorIdentity> {
    if (id === null || id.trim() === "") {
      return NOBODY;
    }
    if (type === "staff") {
      const staff = (await this.staffAuthors.identify([id])).find(id);
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
        select: { firstName: true, lastName: true },
      });
      if (user === null) {
        return NOBODY;
      }
      // 🔴 Plus d'e-mail en secours (lot B du plan des phrases, 2026-09-19) :
      // `actor_name` se fige au journal, et une coordonnée n'y entre pas. Un
      // client sans nom saisi reste sans nom ; l'écran dit alors « un client »
      // (`ACTOR_FALLBACK`, `product-history.ts` ; `journal-line.ts`), et son id
      // reste en `actor_id` pour le retrouver.
      const name = fullName(user.firstName, user.lastName);
      // Pas de « fonction » pour un client : il n'en a pas dans le back-office.
      return { name: name === "" ? null : name, role: null };
    }
    return NOBODY;
  }
}

/** Ni nom ni fonction — l'annuaire ne connaît pas cet acteur. */
const NOBODY: ActorIdentity = { name: null, role: null };

function fullName(firstName: string | null, lastName: string | null): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim();
}

import type { CustomerAudience } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import type { ActivityActorType } from "../domain/activity-event.js";

import { ActorNamer, CUSTOMER_QUALITY, type ActorIdentity } from "../domain/ports/actor-namer.js";

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

  async describe(
    type: ActivityActorType,
    id: string | null,
    actingCompanyId: string | null,
  ): Promise<ActorIdentity> {
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
            // même si le rôle a été renommé entre-temps. Celui de la
            // DÉFINITION : un rôle créé à l'écran n'en a pas dans le contrat.
            role: staff.roleLabel,
          };
    }
    if (type === "customer") {
      return this.describeCustomer(id, actingCompanyId);
    }
    return NOBODY;
  }

  /**
   * Le nom du client, et sa qualité au moment de l'acte : pro s'il agit pour
   * une société active, particulier sinon (§7 du plan des phrases,
   * 2026-10-30). La qualité tient même sans nom : elle ne dit rien de lui.
   */
  private async describeCustomer(
    id: string,
    actingCompanyId: string | null,
  ): Promise<ActorIdentity> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { firstName: true, lastName: true },
    });
    if (user === null) {
      return NOBODY;
    }
    const quality = CUSTOMER_QUALITY[await this.actingAudience(actingCompanyId)];
    // 🔴 Plus d'e-mail en secours (lot B du plan des phrases, 2026-09-19) :
    // `actor_name` se fige au journal, et une coordonnée n'y entre pas. Un
    // client sans nom saisi reste sans nom ; l'écran dit alors « un client »
    // (`ACTOR_FALLBACK`, `product-history.ts` ; `journal-line.ts`), et son id
    // reste en `actor_id` pour le retrouver.
    const name = fullName(user.firstName, user.lastName);
    // Pas de « fonction » pour un client, mais une qualité : pro ou particulier.
    return { name: name === "" ? null : name, role: quality };
  }

  /**
   * Pro dès qu'il agit pour une société qui existe, QUEL QUE SOIT son statut
   * (Hugo, 2026-10-30) : le gérant d'une société en attente de validation est
   * un client pro, pas un particulier. `audienceOf` ne convient pas ici : il
   * dit quel CATALOGUE servir (société active seulement), pas qui a agi.
   */
  private async actingAudience(companyId: string | null): Promise<CustomerAudience> {
    if (companyId === null) {
      return "b2c";
    }
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    return company === null ? "b2c" : "b2b";
  }
}

/** Ni nom ni fonction — l'annuaire ne connaît pas cet acteur. */
const NOBODY: ActorIdentity = { name: null, role: null };

function fullName(firstName: string | null, lastName: string | null): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim();
}

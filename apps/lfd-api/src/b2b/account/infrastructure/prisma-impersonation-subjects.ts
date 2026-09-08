import { Injectable } from "@nestjs/common";

import { ImpersonationSubjects } from "../../../platform/auth/impersonation-subjects.resolver.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **L'annuaire des clients répond au port d'impersonation.**
 *
 * L'adaptateur vit ici parce que la table est ici : c'est `account` qui possède
 * `User`, et lui seul doit la lire. La couche technique déclare son besoin, ce
 * domaine y répond, `appBootstrap` les relie — même geste que
 * `CustomerPrincipalResolver`.
 *
 * ⚠️ Il sert **exclusivement** le bypass de développement, inerte en production
 * (garde-fou dans `AppConfig`). Ce n'est pas une porte d'authentification : il
 * ne vérifie rien, il traduit un identifiant commode en `auth0_sub`.
 */
@Injectable()
export class PrismaImpersonationSubjects extends ImpersonationSubjects {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolve(identifier: string): Promise<string | null> {
    // L'arobase départage : un e-mail ne peut pas être un `auth0_sub`, et
    // l'inverse est vrai aussi. Deux lectures distinctes plutôt qu'un `OR`,
    // parce que `auth0Sub` est unique et `email` ne l'est que par usage.
    const user = identifier.includes("@")
      ? await this.prisma.user.findFirst({ where: { email: identifier } })
      : await this.prisma.user.findUnique({ where: { auth0Sub: identifier } });
    return user?.auth0Sub ?? null;
  }
}

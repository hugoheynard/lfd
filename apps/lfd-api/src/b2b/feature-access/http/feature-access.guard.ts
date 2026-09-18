import { isAtLeast } from "@lfd/contracts";
import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest } from "../../../platform/auth/principal.js";
import { FeatureLevelResolver } from "../application/feature-level.resolver.js";
import { ShopClosedError } from "../domain/shop-closed.error.js";
import { featureSubjectOf } from "./feature-subject.js";
import { REQUIRES_SHOP_KEY, type ShopRequirement } from "./requires-shop.decorator.js";

/**
 * Coupe les routes marquées `@RequiresShop` quand la boutique n'atteint pas le
 * niveau exigé — plan `documentation/auth-inscription/plan-inscription-pro-seule.md` §2.3.
 *
 * Globale (`APP_GUARD`) et enregistrée **après** `AuthGuard` : c'est ce qui lui
 * donne le `Principal`, donc l'exemption. Sur une route `@Public()`, il n'y en a
 * pas, et la route suit le niveau global — « fermée » ferme aussi la vitrine
 * publique (Q4).
 *
 * Route non marquée → passe sans rien lire : la surface admin, les commandes
 * existantes et le compte ne coûtent aucune requête de plus.
 *
 * Le mur est ICI et non dans l'écran : le front masque, le serveur refuse. Sans
 * le second, une requête recopiée depuis l'onglet réseau commanderait quand même.
 */
@Injectable()
export class FeatureAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: FeatureLevelResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ShopRequirement | undefined>(
      REQUIRES_SHOP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const level = await this.resolver.levelFor("shop", featureSubjectOf(request.principal));
    if (isAtLeast("shop", level, required)) {
      return true;
    }
    throw new ShopClosedError(required);
  }
}

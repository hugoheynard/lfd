import type { ShopLevel } from "@lfd/contracts";
import { SetMetadata, type CustomDecorator } from "@nestjs/common";

/** Clé de métadonnée lue par `FeatureAccessGuard`. */
export const REQUIRES_SHOP_KEY = "feature-access:requires-shop";

/**
 * Ce qu'une route peut exiger de la boutique. `closed` n'y est pas : exiger
 * « au moins fermée » ne refuserait jamais rien, et une route qui ne doit pas
 * être coupée ne porte simplement pas de marqueur.
 */
export type ShopRequirement = Exclude<ShopLevel, "closed">;

/**
 * Marque une route comme **coupée tant que la boutique n'est pas au moins à ce
 * niveau** — plan `documentation/auth-inscription/plan-inscription-pro-seule.md` §2.3.
 *
 * Un marqueur plutôt qu'un `if` dans chaque handler, comme `@PublicationGesture` :
 * le refus a besoin de l'exemption, donc du `Principal`, que les commandes ne
 * portent pas ; et la liste de ce qui se ferme se lit en parcourant les
 * contrôleurs. Le test de la table des routes (`__tests__/shop-route-table.spec.ts`)
 * empêche qu'une route cliente naisse sans décision.
 *
 * Ce fichier ne dépend que du contrat : un contrôleur qui l'importe ne traîne
 * ni la garde ni la résolution derrière lui.
 */
export const RequiresShop = (level: ShopRequirement): CustomDecorator<string> =>
  SetMetadata(REQUIRES_SHOP_KEY, level);

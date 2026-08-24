import { Controller, Post } from "@nestjs/common";

import {
  AdminSurface,
  RequirePermission,
} from "../../../../platform/auth/admin-surface.decorator.js";
import {
  ShopifyCollectionsService,
  type InspectResult,
  type PushResult,
} from "./collections.service.js";
import { TaxCollectionsPlan } from "./tax-collections.plan.js";

/**
 * Ressource **collections de TVA** : inspection (diff) et push (créer les
 * manquantes). Sous-chemin `collections/vat` sous le préfixe module
 * `channels/shopify`.
 *
 * Les deux routes ne prennent **aucun corps** : les collections voulues se
 * dérivent du référentiel côté serveur ({@link TaxCollectionsPlan}). Le front
 * envoyait sa propre liste, ce qui laissait un composant Angular décider du
 * titre d'une collection et rendait la publication tributaire d'un écran ouvert.
 *
 * Surface staff murée par `@AdminSurface("catalog")` : identité vérifiée
 * contre l'annuaire, puis périmètre. Elle a été **ouverte** tant que le
 * référentiel vivait dans son propre processus — un jeton Auth0 valide
 * suffisait, et un révoqué gardait la main sur le catalogue.
 *
 * `catalog` et non `tax`, bien que le contenu soit fiscal : ce contrôleur
 * **écrit chez un tiers**. Poser le taux est comptable, le publier est un geste
 * de catalogue — la comptabilité pose un taux juste, le publieur réconcilie.
 */
@AdminSurface("catalog")
@Controller("collections/vat")
export class ShopifyCollectionsController {
  constructor(
    private readonly collections: ShopifyCollectionsService,
    private readonly plan: TaxCollectionsPlan,
  ) {}

  /**
   * Rapproche les collections de TVA voulues et la boutique, sans rien écrire.
   *
   * `catalog:read` explicite : le verbe ment. `POST` impliquerait `write`, donc
   * l'inspection était réservée à l'admin — un lecteur du catalogue voyait un
   * bouton « Inspecter » qui lui répondait 403.
   */
  @RequirePermission("catalog:read")
  @Post("inspect")
  async inspect(): Promise<InspectResult> {
    return this.collections.inspect(await this.plan.desired());
  }

  /**
   * Crée les collections manquantes (vides), puis renvoie l'état réconcilié.
   *
   * **Rattrapage.** La publication des produits crée d'elle-même ce qui manque
   * ({@link ShopifyPushService}) ; cette route sert à rétablir la boutique sans
   * rien publier — après une suppression côté Shopify, par exemple.
   */
  @Post("push")
  async push(): Promise<PushResult> {
    return this.collections.push(await this.plan.desired());
  }
}

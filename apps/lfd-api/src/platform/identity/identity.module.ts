import { Global, Module } from "@nestjs/common";

import { Auth0IdentityGateway } from "./auth0-identity.gateway.js";
import { Auth0ManagementClient } from "./auth0-management.client.js";
import { OpsIdentityCheckController } from "./ops-identity-check.controller.js";

/**
 * Le **canal d'identité** de la plateforme : le transport vers la Management
 * API Auth0, et la mécanique d'ouverture de comptes posée dessus.
 *
 * Global, comme le mailer et la configuration : deux contextes s'en servent
 * déjà — les clients et l'équipe — et rien ne dit qu'ils seront les derniers.
 * L'alternative, l'importer d'un domaine à l'autre, ferait dépendre le contexte
 * staff du contexte `account` pour une raison purement technique.
 *
 * Ce module n'expose **aucun port** : les ports vivent dans les domaines qui les
 * déclarent, chacun n'exposant que les gestes qu'il utilise réellement. Ici on
 * ne fournit que la plomberie.
 */
@Global()
@Module({
  // Le contrôle de mise en service vit à côté du transport qu'il éprouve, comme
  // celui du courrier : le déplacer un jour dans un module `ops/` ferait perdre
  // de vue ce qu'il teste réellement.
  controllers: [OpsIdentityCheckController],
  providers: [Auth0ManagementClient, Auth0IdentityGateway],
  exports: [Auth0ManagementClient, Auth0IdentityGateway],
})
export class IdentityModule {}

import { Global, Module } from "@nestjs/common";

import { OrdersModule } from "../lafoliecoffee/orders/orders.module.js";
import { Ord35SheetOperation } from "../lafoliecoffee/orders/infrastructure/ord-35-sheet.operation.js";
import {
  POST_DEPLOY_OPERATIONS,
  type PostDeployOperation,
} from "../platform/post-deploy/post-deploy-operation.js";

/**
 * **Les opérations après déploiement, reliées**
 * (`documentation/ops/plan-operations-apres-deploiement.md`, § 3.3 et § 7.7).
 *
 * Le contrat vit dans `platform/`, le commerce l'implémente, `ops` le conduit ;
 * seule la racine voit les trois. L'ORDRE de la liste est l'ordre d'affichage
 * et d'exécution (§ 7.1).
 *
 * Une opération faite en production se retire au lot suivant : sa ligne ici,
 * son fichier, et la note dans le plan (§ 7.12).
 *
 * `@Global` : la liste est injectée par le module d'`ops`, qui ne peut pas
 * importer celui-ci.
 */
@Global()
@Module({
  imports: [OrdersModule],
  providers: [
    {
      provide: POST_DEPLOY_OPERATIONS,
      useFactory: (ord35: Ord35SheetOperation): readonly PostDeployOperation[] => [ord35],
      inject: [Ord35SheetOperation],
    },
  ],
  exports: [POST_DEPLOY_OPERATIONS],
})
export class PostDeployOperationsModule {}

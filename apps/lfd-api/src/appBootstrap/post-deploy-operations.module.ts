import { Global, Module } from "@nestjs/common";

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
 * La liste est **vide** depuis le 2026-11-01 : les deux premières (politiques
 * des mercuriales, remises des commandes) ont été simulées à zéro en
 * production et retirées (§ 8). Le mécanisme, la trace et l'écran restent
 * pour la prochaine reprise. Une opération faite en production se retire au
 * lot suivant : sa ligne ici, son fichier, et la note dans le plan (§ 7.12).
 *
 * `@Global` : la liste est injectée par le module d'`ops`, qui ne peut pas
 * importer celui-ci.
 */
@Global()
@Module({
  providers: [
    {
      provide: POST_DEPLOY_OPERATIONS,
      useValue: [] satisfies readonly PostDeployOperation[],
    },
  ],
  exports: [POST_DEPLOY_OPERATIONS],
})
export class PostDeployOperationsModule {}

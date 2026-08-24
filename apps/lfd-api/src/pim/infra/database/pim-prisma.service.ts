import type { Prisma } from "../../../platform/database/client/client.js";
import type { PrismaService } from "../../../platform/database/prisma.service.js";

/**
 * **L'accès du référentiel à la base — et rien qu'à SES tables.**
 *
 * Il y avait ici un second client Prisma, sur une seconde base. B4 l'a retiré :
 * le référentiel est le schéma `pim` de la base commune, aux côtés de `public`,
 * `growth` et `ops`.
 *
 * Ce déménagement a coûté une garantie qu'il fallait rendre. Avant, le client
 * du référentiel ne CONNAISSAIT que ses modèles : `prisma.company` ne compilait
 * pas, parce que la propriété n'existait pas. Aliaser l'unique client aurait
 * rendu `staffNotification`, `nodeStatusLog` et les 47 autres atteignables
 * depuis n'importe quel dépôt du référentiel — un mur tombé sans que personne
 * ne l'écrive.
 *
 * D'où cette **surface énumérée** : les 16 modèles du schéma, un par ligne. Le
 * compilateur refuse le reste. C'est plus verbeux qu'un alias, et c'est le but —
 * ajouter un modèle au schéma sans l'ajouter ici ne le rend pas lisible par
 * accident, et l'inverse se voit en revue.
 *
 * Deux frontières distinctes, qu'il ne faut pas confondre :
 *
 * - **QUI peut injecter** — `PimDatabaseModule` n'est pas `@Global`, seul
 *   `src/pim/` le voit ;
 * - **QUOI il atteint une fois injecté** — ce type-ci.
 *
 * `abstract` : ce n'est plus une implémentation, seulement un nom et une forme.
 * Le module le fait pointer sur l'unique `PrismaService` par `useExisting`, de
 * sorte qu'il n'y a jamais deux connexions — et que les opérations du
 * référentiel sont comptées comme les autres (`schema-ops.counter.ts`).
 */
export abstract class PimPrismaService {
  abstract readonly skuRegistry: PrismaService["skuRegistry"];
  abstract readonly category: PrismaService["category"];
  abstract readonly vatRate: PrismaService["vatRate"];
  abstract readonly salesContext: PrismaService["salesContext"];
  abstract readonly categoryContextVat: PrismaService["categoryContextVat"];
  abstract readonly productContextVat: PrismaService["productContextVat"];
  abstract readonly emplacement: PrismaService["emplacement"];
  abstract readonly emplacementTable: PrismaService["emplacementTable"];
  abstract readonly product: PrismaService["product"];
  abstract readonly productVariant: PrismaService["productVariant"];
  abstract readonly shopifySettings: PrismaService["shopifySettings"];
  abstract readonly shopifyProductBinding: PrismaService["shopifyProductBinding"];
  abstract readonly shopifyPushSnapshot: PrismaService["shopifyPushSnapshot"];
  abstract readonly shopifyVariantBinding: PrismaService["shopifyVariantBinding"];
  abstract readonly nutritionDeclaration: PrismaService["nutritionDeclaration"];
  abstract readonly productEditorial: PrismaService["productEditorial"];
  abstract readonly mediaAsset: PrismaService["mediaAsset"];
  abstract readonly productMedia: PrismaService["productMedia"];
  abstract readonly b2bChannelBinding: PrismaService["b2bChannelBinding"];

  /**
   * Le lot atomique, **forme TABLEAU seulement**.
   *
   * La forme callback (`$transaction(async (tx) => …)`) rendrait un client
   * complet dans `tx` : tout le rétrécissement ci-dessus s'annulerait en une
   * ligne, et rien ne le signalerait. La forme tableau, elle, ne peut contenir
   * que des opérations construites depuis les délégués déclarés plus haut —
   * la frontière tient donc par construction.
   *
   * Le jour où un vrai besoin de callback se présente, il faudra le déclarer
   * ici avec un `tx` lui aussi rétréci. C'est plus de travail, et c'est le
   * bon endroit pour le faire.
   *
   * Le retour est `unknown[]` : les deux appelants jettent le résultat, et
   * reconstruire le tuple typé de Prisma demanderait ici une gymnastique de
   * types pour personne. Quiconque en aura besoin le verra — son code ne
   * compilera pas — et l'affinera à ce moment-là, avec un cas réel sous les
   * yeux plutôt qu'une hypothèse.
   */
  abstract $transaction(operations: readonly Prisma.PrismaPromise<unknown>[]): Promise<unknown[]>;
}

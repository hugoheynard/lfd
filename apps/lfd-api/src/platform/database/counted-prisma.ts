import type { PrismaService } from "./prisma.service.js";
import type { SchemaOpsCounter } from "./schema-ops.counter.js";

/**
 * **Le client, compté** — `$allOperations` intercepte chaque appel ORM, note
 * son modèle, puis laisse passer.
 *
 * Deux propriétés qu'on ne négocie pas :
 *
 * 1. **Le comptage n'échoue jamais l'appel.** Il incrémente une entrée de `Map`
 *    avant de déléguer ; rien n'attend, rien ne peut jeter. Un compteur qui
 *    ferait tomber une requête métier coûterait infiniment plus cher que le
 *    chiffre qu'il produit.
 * 2. **On compte ce qui est TENTÉ, pas ce qui réussit.** Prisma facture l'aller,
 *    pas le retour : une requête qui lève est déjà payée. Compter après le
 *    `await` sous-estimerait la facture exactement les jours d'incident.
 *
 * ⚠️ `$extends` rend un **nouveau** client — il ne modifie pas celui qu'on lui
 * passe. C'est pourquoi le module fournit le résultat sous le jeton
 * `PrismaService` : sans ça, tout le monde continuerait d'injecter le client nu
 * et le compteur resterait à zéro sans que rien ne le signale.
 */
const extendWithCounter = (client: PrismaService, counter: SchemaOpsCounter) =>
  client.$extends({
    query: {
      $allOperations({ model, args, query }) {
        counter.record(model);
        return query(args);
      },
    },
  });

/**
 * Le type du client compté. Il n'est **pas** assignable à `PrismaService` : une
 * extension Prisma reperd `$on` et les méthodes de classe. Les points
 * d'injection continuent pourtant de déclarer `PrismaService`, et c'est exact —
 * ils n'utilisent que des délégués de modèle, que le proxy relaie tous.
 */
export type CountedPrismaClient = ReturnType<typeof extendWithCounter>;

export function countedPrisma(
  client: PrismaService,
  counter: SchemaOpsCounter,
): CountedPrismaClient {
  return extendWithCounter(client, counter);
}

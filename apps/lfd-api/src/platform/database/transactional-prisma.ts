import { currentTransaction } from "./transaction.store.js";

/**
 * Les membres qui ne suivent JAMAIS la transaction ambiante.
 *
 * Le cycle de vie appartient à la connexion, pas à une unité de travail : un
 * `$connect` ou un `$disconnect` émis depuis un dépôt viserait le client de
 * transaction, qui ne les porte pas.
 */
const LIFECYCLE: ReadonlySet<string> = new Set([
  "$connect",
  "$disconnect",
  "$extends",
  "$on",
  "$use",
]);

/**
 * Le client, **routé vers la transaction en cours** s'il y en a une.
 *
 * C'est ce qui permet à la garantie « pas d'enregistrement sans trace » de
 * tenir sans toucher une seule signature : dépôts et journal continuent
 * d'injecter `PrismaService`, et se retrouvent dans la même transaction dès
 * qu'un handler en ouvre une. Sans ce routage il faudrait passer le client de
 * transaction à travers chaque port — donc pouvoir l'oublier.
 *
 * La contrepartie est réelle et se lit ici : le comportement d'un dépôt dépend
 * d'un contexte invisible à la lecture. C'est le prix, assumé, du même choix
 * que `RequestContext`.
 */
export function transactionalPrisma<T extends object>(base: T): T {
  return new Proxy(base, {
    get(target, property, receiver): unknown {
      const tx = currentTransaction();
      if (tx === undefined || (typeof property === "string" && LIFECYCLE.has(property))) {
        return Reflect.get(target, property, receiver);
      }
      if (property === "$transaction") {
        return joinTransaction(tx);
      }
      return property in tx ? Reflect.get(tx, property) : Reflect.get(target, property, receiver);
    },
  });
}

/**
 * `$transaction` **rejoint** l'unité de travail au lieu d'en ouvrir une seconde.
 *
 * Une trentaine de dépôts appellent déjà `$transaction` pour leur propre lot
 * atomique. Le laisser viser le client de base leur ferait ouvrir une
 * transaction INDÉPENDANTE : leurs écritures commiteraient toutes seules, et
 * l'échec du journal ne les annulerait pas — la garantie serait fausse
 * exactement là où on la croirait acquise. Prisma refuse d'ailleurs d'imbriquer.
 *
 * Les deux formes sont couvertes, parce que les deux existent dans le dépôt :
 * la forme TABLEAU (les opérations sont déjà liées à `tx`, il suffit de les
 * attendre dans l'ordre) et la forme CALLBACK (on lui passe la transaction en
 * cours).
 */
function joinTransaction(tx: object) {
  return async (operations: unknown): Promise<unknown> => {
    if (Array.isArray(operations)) {
      const results: unknown[] = [];
      for (const operation of operations) {
        results.push(await operation);
      }
      return results;
    }
    if (typeof operations === "function") {
      return (operations as (client: object) => Promise<unknown>)(tx);
    }
    throw new TypeError("$transaction attend un tableau d'opérations ou une fonction");
  };
}

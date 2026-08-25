import { currentTransaction } from "./transaction.store.js";

/**
 * Les membres qui ne suivent JAMAIS la transaction ambiante.
 *
 * Le cycle de vie appartient à la connexion, pas à une unité de travail — et
 * `$transaction` en particulier doit rester celui du client de base : le client
 * de transaction de Prisma ne le porte pas, et une transaction imbriquée n'est
 * de toute façon pas ce qu'on veut (c'est `UnitOfWork` qui décide de rejoindre
 * celle en cours plutôt que d'en ouvrir une seconde).
 */
const LIFECYCLE: ReadonlySet<string> = new Set([
  "$connect",
  "$disconnect",
  "$transaction",
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
      if (typeof property === "string" && !LIFECYCLE.has(property)) {
        const tx = currentTransaction();
        if (tx !== undefined && property in tx) {
          return Reflect.get(tx, property);
        }
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

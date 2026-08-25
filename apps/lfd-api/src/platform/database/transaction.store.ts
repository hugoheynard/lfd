import { AsyncLocalStorage } from "node:async_hooks";

/**
 * L'**unité de travail ambiante** : le client de transaction en cours, porté par
 * un `AsyncLocalStorage`.
 *
 * Même motif que `RequestContext`, et pour la même raison : ce que tout le
 * chemin d'exécution doit partager ne se passe pas en paramètre de main en
 * main. Un dépôt qui devrait recevoir le client de transaction en argument est
 * un dépôt qu'on peut oublier de brancher — et une garantie qu'il faut se
 * rappeler de brancher n'est pas une garantie.
 *
 * ⚠️ Le mécanisme rend le client AMBIANT ; il n'ouvre rien tout seul. C'est
 * `UnitOfWork` qui décide où commence et où finit une transaction.
 *
 * Le client est typé `object` et non `Prisma.TransactionClient` : celui que
 * rend le `$transaction` d'un client ÉTENDU (le nôtre est compté) a une forme
 * propre, que Prisma n'expose sous aucun nom. Ça ne coûte rien ici — le seul
 * consommateur est le proxy, qui teste la présence d'un membre puis le relaie.
 * Les appelants, eux, gardent le type complet du client compté.
 */
const storage = new AsyncLocalStorage<object>();

/** Le client de transaction en cours, ou `undefined` hors transaction. */
export function currentTransaction(): object | undefined {
  return storage.getStore();
}

/** Exécute `work` (et toute sa descendance async) sous le client `tx`. */
export function runInTransaction<T>(tx: object, work: () => Promise<T>): Promise<T> {
  return storage.run(tx, work);
}

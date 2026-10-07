import { AsyncLocalStorage } from "node:async_hooks";
import { Logger } from "@nestjs/common";

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
interface TransactionFrame {
  readonly tx: object;
  readonly commits: CommitQueue;
}

const storage = new AsyncLocalStorage<TransactionFrame>();

/** Un rappel à exécuter une fois la transaction validée. */
export type AfterCommitCallback = () => void | Promise<void>;

/**
 * La **file des rappels d'après validation** d'une unité de travail
 * (`documentation/livraisons/livreur/a-la-porte.md`, B0 et § 10 bis).
 *
 * Elle appartient à l'unité la PLUS EXTERNE : une unité imbriquée rejoint la
 * transaction en cours, donc son « après validation » est celui de la
 * transaction réelle — pas la fin de son propre bloc, qui ne valide rien.
 */
export class CommitQueue {
  private readonly logger = new Logger(CommitQueue.name);
  private readonly pending: { readonly callback: AfterCommitCallback; readonly label: string }[] =
    [];

  defer(callback: AfterCommitCallback, label: string): void {
    this.pending.push({ callback, label });
  }

  /**
   * Exécute les rappels, dans l'ordre d'inscription, **hors** de toute
   * transaction ambiante : celle qui vient d'être validée est close, et une
   * lecture qui la viserait encore échouerait.
   *
   * Aucun rappel n'est attendu : la transaction est déjà validée, la requête
   * n'a pas à payer le temps d'un courriel. Un rappel qui échoue — en levant
   * ou en rejetant — est journalisé et n'empêche ni les suivants, ni la
   * réponse : ce qui est validé l'est, et sa réparation est le rejeu du geste.
   */
  flush(): void {
    const callbacks = this.pending.splice(0);
    storage.exit(() => {
      for (const { callback, label } of callbacks) {
        runGuarded(callback, label, this.logger);
      }
    });
  }
}

function runGuarded(callback: AfterCommitCallback, label: string, logger: Logger): void {
  const report = (cause: unknown): void => {
    logger.error(`Rappel d'après validation en échec (${label})`, cause);
  };
  try {
    void Promise.resolve(callback()).catch(report);
  } catch (cause) {
    report(cause);
  }
}

const immediate = new CommitQueue();

/** Le client de transaction en cours, ou `undefined` hors transaction. */
export function currentTransaction(): object | undefined {
  return storage.getStore()?.tx;
}

/**
 * Exécute `work` (et toute sa descendance async) sous le client `tx`.
 *
 * `commits` reçoit les rappels inscrits pendant `work` ; c'est à l'appelant —
 * l'unité de travail — de la vider APRÈS la validation, et seulement si elle
 * a eu lieu. Sans file fournie, les rappels sont perdus avec la transaction :
 * c'est le cas des tests du proxy, qui ne valident rien.
 */
export function runInTransaction<T>(
  tx: object,
  work: () => Promise<T>,
  commits: CommitQueue = new CommitQueue(),
): Promise<T> {
  return storage.run({ tx, commits }, work);
}

/**
 * Inscrit `callback` pour après la validation de la transaction ambiante.
 *
 * **Hors de toute transaction, il s'exécute tout de suite** : il n'y a rien à
 * attendre, et ce qui l'a précédé est déjà écrit. Il reste gardé de la même
 * façon — journalisé s'il échoue, jamais remonté.
 */
export function deferUntilCommit(callback: AfterCommitCallback, label: string): void {
  const frame = storage.getStore();
  if (frame === undefined) {
    immediate.defer(callback, label);
    immediate.flush();
    return;
  }
  frame.commits.defer(callback, label);
}

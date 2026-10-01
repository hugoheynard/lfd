import { Injectable } from "@nestjs/common";

import { type AfterCommitCallback, deferUntilCommit } from "./transaction.store.js";

/**
 * **Exécuter après la validation** (`documentation/livraisons/plan-a-la-porte.md`,
 * B0) : réagir à un fait seulement une fois qu'il est écrit pour de bon.
 *
 * Un abonné d'événement est appelé par le bus DANS la transaction qui publie ;
 * s'il envoie un courriel tout de suite, le courriel part même si la
 * validation échoue ensuite. Inscrit ici, rien ne part si l'unité échoue.
 *
 * Port à part plutôt que méthode de `UnitOfWork` : celui qui réagit à un fait
 * n'ouvre pas de transaction, et ne doit pas pouvoir le faire. Il ne dépend
 * que de ce qu'il appelle (ISP).
 *
 * Hors de toute transaction, le rappel s'exécute tout de suite. Un rappel qui
 * échoue est journalisé ; il ne fait jamais échouer ce qui est déjà validé.
 */
export abstract class AfterCommit {
  abstract defer(callback: AfterCommitCallback, label: string): void;
}

/** L'adaptateur : la file de l'unité de travail ambiante (`transaction.store.ts`). */
@Injectable()
export class AmbientAfterCommit extends AfterCommit {
  defer(callback: AfterCommitCallback, label: string): void {
    deferUntilCommit(callback, label);
  }
}

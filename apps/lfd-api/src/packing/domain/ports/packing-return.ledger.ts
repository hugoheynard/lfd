/** Une demande de retour du fournil, telle que le colisage la reçoit. */
export interface ReturnToDecide {
  readonly requestId: string;
  readonly serviceDay: string;
  readonly sku: string;
  /** La remise visée — l'`id` de la fournée. */
  readonly handoffId: string;
  readonly requested: number;
  readonly receivedAt: Date;
}

/**
 * **Les demandes de retour, en écriture** (K2, §13 B2).
 *
 * ⚠️ Des écritures ciblées, et c'est le cas que le §3.1 autorise : ce sont la
 * trace d'un fait reçu (idempotence) et la trace d'une décision que
 * `PackingStock.giveBack` vient de prendre sous verrou. Aucune règle ne peut
 * les refuser ici ; la seule, « au bac ≤ reçu − rendu », est dans la réserve.
 */
export abstract class PackingReturnLedger {
  /** @returns `false` si la demande était déjà reçue (rejeu). */
  abstract record(request: ReturnToDecide): Promise<boolean>;

  /** Pose la décision, une fois (`decided_at IS NULL` en base). */
  abstract decide(requestId: string, returned: number, decidedAt: Date): Promise<void>;
}

/** **Les demandes de retour, en lecture** — port séparé (ISP). */
export abstract class PackingReturnReader {
  /** La remise de cette fournée est-elle arrivée au colisage ? */
  abstract isHandoffReceived(handoffId: string): Promise<boolean>;

  /** Les demandes non tranchées qui attendent cette remise. */
  abstract pendingFor(handoffId: string): Promise<readonly ReturnToDecide[]>;
}

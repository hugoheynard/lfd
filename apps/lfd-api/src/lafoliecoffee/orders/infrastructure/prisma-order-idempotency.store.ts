import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import {
  IDEMPOTENCY_LEASE_MS,
  OrderIdempotencyStore,
  type IdempotencyClaim,
} from "../domain/ports/order-idempotency.store.js";

/** Code Postgres d'une violation de contrainte unique. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Adaptateur Prisma du registre des clés de passation.
 *
 * Tout le dispositif tient dans la façon dont `claim` écrit **d'abord** : on
 * tente l'insertion, et c'est le refus de l'index unique qui nous apprend que
 * quelqu'un est déjà passé. Lire d'abord aurait laissé deux appels simultanés
 * trouver le registre vide et passer deux commandes.
 */
@Injectable()
export class PrismaOrderIdempotencyStore extends OrderIdempotencyStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async claim(
    userId: string,
    key: string,
    fingerprint: string,
    now: Date,
  ): Promise<IdempotencyClaim> {
    try {
      await this.prisma.orderIdempotency.create({
        data: { id: this.ids.next(), userId, key, requestFingerprint: fingerprint, claimedAt: now },
        select: { id: true },
      });
      return { kind: "claimed" };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return this.decideOnExisting(userId, key, fingerprint, now);
    }
  }

  /**
   * Quelqu'un tient déjà la clé. Trois issues, dans cet ordre — et l'ordre
   * compte : l'empreinte se juge AVANT le bail, sinon une clé abandonnée serait
   * reprise pour un panier qui n'a rien à voir avec celui qu'elle désignait.
   */
  private async decideOnExisting(
    userId: string,
    key: string,
    fingerprint: string,
    now: Date,
  ): Promise<IdempotencyClaim> {
    const held = await this.prisma.orderIdempotency.findUnique({
      where: { userId_key: { userId, key } },
      select: { orderId: true, requestFingerprint: true, claimedAt: true },
    });
    if (held === null) {
      // La ligne a disparu entre l'insertion refusée et cette lecture : un autre
      // appel l'a rendue. Rien ne tient plus la clé — on retente, une fois.
      return this.claim(userId, key, fingerprint, now);
    }
    if (held.requestFingerprint !== fingerprint) {
      return { kind: "mismatch" };
    }
    if (held.orderId !== null) {
      return { kind: "replayed", orderId: held.orderId };
    }
    // Réclamée, non résolue. Le bail décide : encore en vol, ou abandonnée.
    if (now.getTime() - held.claimedAt.getTime() < IDEMPOTENCY_LEASE_MS) {
      return { kind: "in_flight" };
    }
    // REPRISE. Le `orderId: null` du WHERE est ce qui la rend sûre : si l'appel
    // d'origine a abouti entre-temps, sa transaction a résolu la clé, et cette
    // écriture ne matche plus rien — on relit alors, plutôt que d'écraser.
    const { count } = await this.prisma.orderIdempotency.updateMany({
      where: { userId, key, orderId: null, claimedAt: held.claimedAt },
      data: { claimedAt: now, requestFingerprint: fingerprint },
    });
    return count === 1 ? { kind: "claimed" } : this.decideOnExisting(userId, key, fingerprint, now);
  }

  async resolve(userId: string, key: string, orderId: string): Promise<void> {
    await this.prisma.orderIdempotency.updateMany({
      where: { userId, key },
      data: { orderId },
    });
  }

  async release(userId: string, key: string): Promise<void> {
    // `deleteMany` et `orderId: null` : on ne rend JAMAIS une clé résolue. Même
    // si l'appelant se trompait de position, la base refuserait d'effacer la
    // trace d'une commande qui existe.
    await this.prisma.orderIdempotency.deleteMany({ where: { userId, key, orderId: null } });
  }
}

/** Une violation d'unicité, reconnue sans dépendre du message. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

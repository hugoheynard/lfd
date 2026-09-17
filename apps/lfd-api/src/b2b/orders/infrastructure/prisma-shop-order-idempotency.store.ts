import { Injectable } from "@nestjs/common";

import { Prisma } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { IDEMPOTENCY_LEASE_MS } from "../domain/ports/order-idempotency.store.js";
import {
  ShopOrderIdempotencyStore,
  type IdempotencyClaim,
} from "../domain/ports/shop-order-idempotency.store.js";

/** Code Postgres d'une violation de contrainte unique. */
const UNIQUE_VIOLATION = "P2002";

/**
 * Adaptateur Prisma du registre des clés de la boutique publique.
 *
 * La mécanique est celle de {@link PrismaOrderIdempotencyStore}, au mur près :
 * on écrit **d'abord**, et c'est le refus de l'index unique qui nous apprend que
 * quelqu'un est déjà passé. Lire d'abord laisserait deux appels simultanés
 * trouver le registre vide et passer deux commandes — ce qui est précisément ce
 * qu'un double clic produit.
 *
 * Le **bail** est partagé avec l'autre registre
 * ({@link IDEMPOTENCY_LEASE_MS}) plutôt que recopié : c'est la même question —
 * « à partir de quand un appel est-il réputé mort ? » — et deux valeurs qui
 * divergeraient feraient reprendre une clé ici pendant qu'elle est encore en vol
 * là-bas, sans qu'aucune des deux constantes ne paraisse fausse.
 */
@Injectable()
export class PrismaShopOrderIdempotencyStore extends ShopOrderIdempotencyStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async claim(key: string, fingerprint: string, now: Date): Promise<IdempotencyClaim> {
    try {
      await this.prisma.shopOrderIdempotency.create({
        data: { id: this.ids.next(), key, requestFingerprint: fingerprint, claimedAt: now },
        select: { id: true },
      });
      return { kind: "claimed" };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      return this.decideOnExisting(key, fingerprint, now);
    }
  }

  /**
   * Quelqu'un tient déjà la clé. Trois issues, et l'ordre compte : l'empreinte
   * se juge AVANT le bail, sinon une clé abandonnée serait reprise pour un
   * panier qui n'a rien à voir avec celui qu'elle désignait.
   */
  private async decideOnExisting(
    key: string,
    fingerprint: string,
    now: Date,
  ): Promise<IdempotencyClaim> {
    const held = await this.prisma.shopOrderIdempotency.findUnique({
      where: { key },
      select: { orderId: true, requestFingerprint: true, claimedAt: true },
    });
    if (held === null) {
      // La ligne a disparu entre l'insertion refusée et cette lecture : un autre
      // appel l'a rendue. Rien ne tient plus la clé — on retente, une fois.
      return this.claim(key, fingerprint, now);
    }
    if (held.requestFingerprint !== fingerprint) {
      return { kind: "mismatch" };
    }
    if (held.orderId !== null) {
      return { kind: "replayed", orderId: held.orderId };
    }
    if (now.getTime() - held.claimedAt.getTime() < IDEMPOTENCY_LEASE_MS) {
      return { kind: "in_flight" };
    }
    // REPRISE. Le `orderId: null` du WHERE est ce qui la rend sûre : si l'appel
    // d'origine a abouti entre-temps, sa transaction a résolu la clé, et cette
    // écriture ne matche plus rien — on relit alors, plutôt que d'écraser.
    const { count } = await this.prisma.shopOrderIdempotency.updateMany({
      where: { key, orderId: null, claimedAt: held.claimedAt },
      data: { claimedAt: now, requestFingerprint: fingerprint },
    });
    return count === 1 ? { kind: "claimed" } : this.decideOnExisting(key, fingerprint, now);
  }

  async resolve(key: string, orderId: string): Promise<void> {
    await this.prisma.shopOrderIdempotency.updateMany({ where: { key }, data: { orderId } });
  }

  async release(key: string): Promise<void> {
    // `deleteMany` et `orderId: null` : on ne rend JAMAIS une clé résolue. Même
    // si l'appelant se trompait de position, la base refuserait d'effacer la
    // trace d'une commande qui existe.
    await this.prisma.shopOrderIdempotency.deleteMany({ where: { key, orderId: null } });
  }
}

/** Une violation d'unicité, reconnue sans dépendre du message. */
function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION;
}

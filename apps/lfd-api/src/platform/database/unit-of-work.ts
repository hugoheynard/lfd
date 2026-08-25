import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";
import type { CountedPrismaClient } from "./counted-prisma.js";
import { runInTransaction, currentTransaction } from "./transaction.store.js";

/**
 * Une **unité de travail** : tout ce qui s'écrit à l'intérieur part ensemble,
 * ou rien ne part.
 *
 * C'est ce qui rend une trace **bloquante**. Le journal n'est plus un témoin
 * qu'on écrit à côté et qui peut manquer en silence : il est dans la même
 * transaction que la décision qu'il décrit. Un échec d'écriture du journal
 * annule l'enregistrement — c'est la contrepartie voulue, et elle doit se
 * lire, parce qu'elle fait du journal un point de panne du métier.
 *
 * **Garder la transaction COURTE.** La production passe par Accelerate : chaque
 * requête traverse le proxy et une transaction interactive y a un délai
 * maximal. On n'enveloppe donc que l'écriture et sa trace — jamais un appel
 * réseau tiers (Shopify, mailer), qui tiendrait la transaction ouverte le temps
 * d'un aller-retour hors de notre contrôle.
 *
 * Abstraite : les handlers en dépendent, l'adaptateur Prisma l'implémente. Un
 * handler qui injecterait le client concret ne pourrait plus se tester sans
 * base — et c'est exactement ce que ces tests-là ne doivent pas demander.
 */
export abstract class UnitOfWork {
  abstract run<T>(work: () => Promise<T>): Promise<T>;
}

@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(@Inject(PrismaService) private readonly prisma: CountedPrismaClient) {
    super();
  }

  /**
   * Exécute `work` dans une transaction. Déjà dans une transaction, on **rejoint
   * celle en cours** plutôt que d'en ouvrir une seconde : Prisma ne sait pas
   * imbriquer, et deux unités de travail concurrentes sur le même flux
   * signifieraient qu'une moitié peut être annulée sans l'autre.
   */
  async run<T>(work: () => Promise<T>): Promise<T> {
    if (currentTransaction() !== undefined) {
      return work();
    }
    return this.prisma.$transaction((tx) => runInTransaction(tx, work));
  }
}

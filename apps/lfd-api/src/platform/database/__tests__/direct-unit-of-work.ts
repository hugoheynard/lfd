import { UnitOfWork } from "../unit-of-work.js";

/**
 * Une unité de travail **sans transaction** : elle exécute le travail, point.
 *
 * Ce que les tests de handler vérifient est l'INTENTION — « la trace part avec
 * l'écriture » — pas la mécanique transactionnelle de Prisma, qui se prouve
 * contre un vrai Postgres et nulle part ailleurs. Un double qui feindrait de
 * transactionner mentirait sur la seule chose qui compte.
 */
export class DirectUnitOfWork extends UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

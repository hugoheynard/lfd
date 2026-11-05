import type { FeatureLevelsView } from "@lfd/contracts";

/**
 * Qui demande ses niveaux : son adresse, et si elle est PROUVÉE — seule une
 * adresse prouvée ouvre une exemption. `null` = personne.
 */
export type FeatureLevelsSubject = {
  readonly email: string;
  readonly emailProven: boolean;
} | null;

/**
 * Port de **lecture** : les niveaux des fonctionnalités pour une personne,
 * servis dans `GET /me`.
 *
 * Déclaré par le compte, IMPLÉMENTÉ par `feature-access`
 * (`ResolvedAccountFeatureLevels`), relié par
 * `appBootstrap/account-feature-levels.module.ts` : le compte ne lit pas les
 * tables d'un autre contexte (`lint:prisma-model-ownership`), et
 * `FeatureAccessModule` importe déjà `AccountModule` — l'inverse ferait un
 * cycle (vérifié le 2026-11-05).
 */
export abstract class AccountFeatureLevelsReader {
  abstract levelsFor(subject: FeatureLevelsSubject): Promise<FeatureLevelsView>;
}

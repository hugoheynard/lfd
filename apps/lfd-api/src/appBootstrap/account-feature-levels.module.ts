import { Global, Module } from "@nestjs/common";

import { AccountFeatureLevelsReader } from "../lafoliecoffee/account/domain/ports/account-feature-levels.reader.js";
import { ResolvedAccountFeatureLevels } from "../lafoliecoffee/feature-access/application/resolved-account-feature-levels.js";
import { FeatureAccessModule } from "../lafoliecoffee/feature-access/feature-access.module.js";

/**
 * **Les niveaux de fonctionnalités dans `GET /me`, reliés** (2026-11-05).
 *
 * Le compte DÉCLARE `AccountFeatureLevelsReader`, `feature-access`
 * l'IMPLÉMENTE. `@Global` parce que `FeatureAccessModule` importe déjà
 * `AccountModule` (pour `StaffDirectory`) : le compte ne peut pas l'importer
 * en retour sans cycle.
 */
@Global()
@Module({
  imports: [FeatureAccessModule],
  providers: [{ provide: AccountFeatureLevelsReader, useClass: ResolvedAccountFeatureLevels }],
  exports: [AccountFeatureLevelsReader],
})
export class AccountFeatureLevelsModule {}

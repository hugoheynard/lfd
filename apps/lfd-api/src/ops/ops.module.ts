import { Module } from "@nestjs/common";

import { AppConfig } from "../platform/config/app-config.js";
import { AdminHealthController } from "./health/admin-health.controller.js";
import { DatabaseReadingsReader } from "./health/database-readings.reader.js";
import { Auth0Probe, ResendProbe, ShopifyProbe, StripeProbe } from "./probes/external.probes.js";
import { PostgresB2bProbe } from "./probes/postgres.probe.js";
import { ProbeRunner } from "./probes/probe-runner.service.js";
import { NODE_PROBES, type NodeProbe } from "./probes/probe.port.js";
import { OpsHealthService } from "./health/ops-health.service.js";
import { AdminTrafficController } from "./traffic/admin-traffic.controller.js";
import { AnalyticsEngineTrafficReader } from "./traffic/analytics-engine-traffic.reader.js";
import { RehearsalTrafficReader } from "./traffic/rehearsal-traffic.reader.js";
import { TrafficReader } from "./traffic/traffic-reader.port.js";

/**
 * **OPS** — la carte de santé de l'écosystème. Il observe, il ne possède rien.
 *
 * C'est ce qui lui vaut la ligne la plus stricte de la matrice de frontières :
 * `ops → platform`, et **personne n'importe `ops`**. N'ayant aucun métier, il
 * n'a rien à lire chez `b2b`, `pim` ou `staff` — et le jour où il partira dans
 * sa propre app, ce sera un déménagement de bloc, l'opération que B2c a déjà
 * faite pour le référentiel.
 *
 * Il vit ici, dans `lfd-api`, **avant la mise en service** et pour une raison
 * qui vaut mieux que la commodité : l'annuaire staff et son mur y sont déjà, et
 * les recréer ailleurs ferait deux vérités sur qui est staff.
 */
@Module({
  controllers: [AdminTrafficController, AdminHealthController],
  providers: [
    OpsHealthService,
    DatabaseReadingsReader,
    ProbeRunner,
    PostgresB2bProbe,
    Auth0Probe,
    ResendProbe,
    StripeProbe,
    ShopifyProbe,
    {
      // Le registre. Une sonde ajoutée s'inscrit ICI et nulle part ailleurs :
      // le lanceur ne connaît que le port, la dérivation ne connaît que des
      // verdicts. C'est ce qui permettra d'en brancher une sur R2 ou sur un
      // worker sans toucher à une ligne de règle.
      provide: NODE_PROBES,
      inject: [PostgresB2bProbe, Auth0Probe, ResendProbe, StripeProbe, ShopifyProbe],
      useFactory: (...probes: NodeProbe[]): readonly NodeProbe[] => probes,
    },
    AnalyticsEngineTrafficReader,
    RehearsalTrafficReader,
    {
      // Le choix se fait UNE FOIS, au démarrage, sur la présence de la
      // configuration — jamais requête par requête. Une bascule en cours de
      // route rendrait deux appels successifs incomparables, et c'est
      // précisément ce qu'un écran de diagnostic ne doit pas faire.
      //
      // Et contrairement aux doubles de dev ailleurs dans l'app, celui-ci reste
      // autorisé EN PRODUCTION : un OPS non configuré doit rendre une réponse
      // qui s'annonce comme une répétition, pas refuser. Il ne donne accès à
      // rien — c'est un écran de lecture ; le laisser muet en prod ferait
      // croire à une flotte silencieuse.
      provide: TrafficReader,
      inject: [AppConfig, AnalyticsEngineTrafficReader, RehearsalTrafficReader],
      useFactory: (
        config: AppConfig,
        analytics: AnalyticsEngineTrafficReader,
        rehearsal: RehearsalTrafficReader,
      ): TrafficReader => (config.analyticsConfig() === null ? rehearsal : analytics),
    },
  ],
})
export class OpsModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AccountModule } from "../b2b/account/account.module.js";
import { AlertsModule } from "../b2b/alerts/alerts.module.js";
import { DeliveryZonesModule } from "../b2b/delivery-zones/delivery-zones.module.js";
import { GrowthModule } from "../b2b/growth/growth.module.js";
import { OrdersModule } from "../b2b/orders/orders.module.js";
import { PricingAdminModule } from "../b2b/pricing/pricing-admin.module.js";
import { PaymentsModule } from "../b2b/payments/payments.module.js";
import { OrderCutoffsModule } from "../b2b/order-cutoffs/order-cutoffs.module.js";
import { CatalogModule } from "../b2b/catalog/catalog.module.js";
import { OpsModule } from "../ops/ops.module.js";
import { PimModule } from "../pim/pim.module.js";
import { CatalogFeedModule } from "./catalog-feed.module.js";
import { StaffAccessModule } from "./staff-access.module.js";
import { PickupAddressesModule } from "../b2b/pickup-addresses/pickup-addresses.module.js";
import { StaffNotificationsModule } from "../staff/notifications/staff-notifications.module.js";
import { StaffUsersModule } from "../staff/staff.module.js";
import { SubscriptionsModule } from "../b2b/subscriptions/subscriptions.module.js";
import { AuthModule } from "../platform/auth/auth.module.js";
import { AppConfigModule } from "../platform/config/config.module.js";
import { envFilePaths } from "../platform/config/env-readers.js";
import { BusModule } from "../platform/bus/bus.module.js";
import { ContextModule } from "../platform/context/context.module.js";
import { EventsModule } from "../platform/events/events.module.js";
import { IdentityModule } from "../platform/identity/identity.module.js";
import { LoggingModule } from "../platform/logging/logging.module.js";
import { StartupModule } from "../platform/startup/startup.module.js";
import { MailerModule } from "../platform/mailer/mailer.module.js";
import { DatabaseModule } from "../platform/database/database.module.js";
import { SecurityModule } from "../platform/security/security.module.js";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "../platform/auth/auth.guard.js";

@Module({
  imports: [
    // En premier : charge les fichiers d'environnement dans process.env AVANT
    // que les providers d'infra (DB, Auth) ne lisent leur configuration à
    // l'instanciation. `prisma.config.ts` ne charge dotenv que pour la CLI
    // Prisma — le runtime de l'app a besoin de son propre chargement.
    // Deux fichiers en développement : `.env` (secrets, machine) par-dessus
    // `.env.development` (coordonnées de l'infra dockerisée) — cf. envFilePaths.
    ConfigModule.forRoot({ isGlobal: true, envFilePath: envFilePaths() }),
    // Puis notre passerelle typée : le seul accès autorisé à l'environnement.
    AppConfigModule,
    // Fondations cross-cutting (@Global) : ports Clock + IdGenerator. Tôt, car
    // tout contexte métier en aval en dépend (temps métier, ids ULID).
    // Les bus CQRS (@Global) : les contextes les injectent sans réimporter.
    BusModule,
    ContextModule,
    // Publication d'événements de domaine (@Global) : bus cqrs derrière un port
    // injectable. Les émetteurs publient, le journal croissance écoute.
    EventsModule,
    IdentityModule,
    StartupModule,
    LoggingModule,
    MailerModule,
    DatabaseModule,
    // AVANT AuthModule : le ThrottlerGuard (APP_GUARD) doit s'exécuter en premier
    // pour rejeter un flood en 429 avant tout travail d'authentification.
    SecurityModule,
    AuthModule,
    // Config globale (feature flags d'activation) — avant les contextes qui la lisent.
    OrderCutoffsModule,
    PickupAddressesModule,
    CatalogModule,
    DeliveryZonesModule,
    // Annuaire back-office (isolé, source de vérité locale).
    StaffUsersModule,
    // La résolution d'accès staff, reliée : le port est technique, l'adaptateur
    // lit l'annuaire, et seule la racine voit les deux.
    StaffAccessModule,
    // Cloche du back-office (@Global) : socle générique dont les alertes sont le
    // premier consommateur, J2 (RDV, demandes de contact) le second.
    StaffNotificationsModule,
    // Le référentiel produit — même processus, **sa** base (cf. PimDatabaseModule),
    // ses routes sous `pim/`.
    OpsModule,
    PimModule,
    // Le fil entre les deux, relié ici : le port est au PIM, l'adaptateur à la
    // plateforme, et seule la racine a le droit de les voir tous les deux.
    CatalogFeedModule,
    // Contextes métier.
    AccountModule,
    // Paiement avant Orders : Orders consomme le port PaymentGateway exposé ici.
    PaymentsModule,
    OrdersModule,
    PricingAdminModule,
    // Paniers récurrents (abonnements) — murés par le seul client connecté.
    SubscriptionsModule,
    // Croissance (cross-domain) : journal d'événements, consommé par les émetteurs.
    GrowthModule,
    // Alertes de compte client : surveille un compte DÉJÀ client (produit inédit,
    // écart à sa propre moyenne). Après Orders : il écoute `order.placed`.
    AlertsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // **Le guard client, déclaré ICI et pas dans `AuthModule`.**
    //
    // Il met bout à bout deux choses qui n'appartiennent pas à la même couche :
    // la vérification du jeton (technique) et la résolution du principal
    // (`account/`). L'enregistrer dans `infra/auth` obligerait la couche
    // technique à importer un domaine — ce que la matrice des frontières
    // interdit, et pour une raison concrète : le jour où le socle staff ou le
    // PIM se posent ici, l'authentification n'a aucune raison de traîner la
    // plateforme marchande derrière elle.
    //
    // La racine de composition est le seul endroit qui a le droit de connaître
    // tout le monde. L'API reste protégée par défaut : c'est le LIEU de la
    // déclaration qui change, pas la règle.
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}

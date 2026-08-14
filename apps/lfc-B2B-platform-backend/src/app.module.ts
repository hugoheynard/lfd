import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AccountModule } from "./account/account.module.js";
import { AlertsModule } from "./alerts/alerts.module.js";
import { DeliveryZonesModule } from "./delivery-zones/delivery-zones.module.js";
import { GrowthModule } from "./growth/growth.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { OrderCutoffsModule } from "./order-cutoffs/order-cutoffs.module.js";
import { PickupAddressesModule } from "./pickup-addresses/pickup-addresses.module.js";
import { StaffNotificationsModule } from "./staff-notifications/staff-notifications.module.js";
import { StaffUsersModule } from "./staff-users/staff-users.module.js";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module.js";
import { AuthModule } from "./infra/auth/auth.module.js";
import { AppConfigModule } from "./infra/config/config.module.js";
import { envFilePaths } from "./infra/config/env-readers.js";
import { ContextModule } from "./infra/context/context.module.js";
import { EventsModule } from "./infra/events/events.module.js";
import { IdentityModule } from "./infra/identity/identity.module.js";
import { StartupModule } from "./infra/startup/startup.module.js";
import { MailerModule } from "./infra/mailer/mailer.module.js";
import { DatabaseModule } from "./infra/database/database.module.js";
import { SecurityModule } from "./infra/security/security.module.js";

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
    ContextModule,
    // Publication d'événements de domaine (@Global) : bus cqrs derrière un port
    // injectable. Les émetteurs publient, le journal croissance écoute.
    EventsModule,
    IdentityModule,
    StartupModule,
    MailerModule,
    DatabaseModule,
    // AVANT AuthModule : le ThrottlerGuard (APP_GUARD) doit s'exécuter en premier
    // pour rejeter un flood en 429 avant tout travail d'authentification.
    SecurityModule,
    AuthModule,
    // Config globale (feature flags d'activation) — avant les contextes qui la lisent.
    OrderCutoffsModule,
    PickupAddressesModule,
    DeliveryZonesModule,
    // Annuaire back-office (isolé, source de vérité locale).
    StaffUsersModule,
    // Cloche du back-office (@Global) : socle générique dont les alertes sont le
    // premier consommateur, J2 (RDV, demandes de contact) le second.
    StaffNotificationsModule,
    // Contextes métier.
    AccountModule,
    // Paiement avant Orders : Orders consomme le port PaymentGateway exposé ici.
    PaymentsModule,
    OrdersModule,
    // Paniers récurrents (abonnements) — murés par le seul client connecté.
    SubscriptionsModule,
    // Croissance (cross-domain) : journal d'événements, consommé par les émetteurs.
    GrowthModule,
    // Alertes de compte client : surveille un compte DÉJÀ client (produit inédit,
    // écart à sa propre moyenne). Après Orders : il écoute `order.placed`.
    AlertsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

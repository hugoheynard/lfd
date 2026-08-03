import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AccountModule } from "./account/account.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PickupAddressesModule } from "./pickup-addresses/pickup-addresses.module.js";
import { PlatformSettingsModule } from "./platform-settings/platform-settings.module.js";
import { StaffUsersModule } from "./staff-users/staff-users.module.js";
import { AuthModule } from "./infra/auth/auth.module.js";
import { AppConfigModule } from "./infra/config/config.module.js";
import { DatabaseModule } from "./infra/database/database.module.js";

@Module({
  imports: [
    // En premier : charge `.env` dans process.env AVANT que les providers
    // d'infra (DB, Auth) ne lisent leur configuration à l'instanciation.
    // `prisma.config.ts` ne charge dotenv que pour la CLI Prisma — le runtime
    // de l'app a besoin de son propre chargement.
    ConfigModule.forRoot({ isGlobal: true }),
    // Puis notre passerelle typée : le seul accès autorisé à l'environnement.
    AppConfigModule,
    DatabaseModule,
    AuthModule,
    // Config globale (feature flags d'activation) — avant les contextes qui la lisent.
    PlatformSettingsModule,
    PickupAddressesModule,
    // Annuaire back-office (isolé, source de vérité locale).
    StaffUsersModule,
    // Contextes métier.
    AccountModule,
    OrdersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RouterModule } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CatalogueModule } from './catalogue/catalogue.module.js';
import { B2bPlatformModule } from './channels/b2b-platform/b2b-platform.module.js';
import { ShopifyModule } from './channels/shopify/shopify.module.js';
import { CommerceModule } from './commerce/commerce.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { AuthModule } from './infra/auth/auth.module.js';
import { AppConfigModule } from './infra/config/config.module.js';
import { envFilePaths } from './infra/config/app-config.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { SecurityModule } from './infra/security/security.module.js';

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
    DatabaseModule,
    // AVANT AuthModule : le ThrottlerGuard (APP_GUARD) doit s'exécuter en premier
    // pour rejeter un flood en 429 avant tout travail d'authentification.
    SecurityModule,
    AuthModule,
    CatalogueModule,
    CommerceModule,
    LocationsModule,
    ShopifyModule,
    B2bPlatformModule,
    // Hiérarchie des routes montée ici (racine de composition) : les contrôleurs
    // d'un module de canal héritent de son préfixe (`channels/shopify`,
    // `channels/b2b`), donc ils ne déclarent que leur sous-chemin (`settings`,
    // `collections/tva/…`, `products`).
    RouterModule.register([
      {
        path: 'channels',
        children: [
          { path: 'shopify', module: ShopifyModule },
          { path: 'b2b', module: B2bPlatformModule },
        ],
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

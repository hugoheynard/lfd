import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './infra/config/app-config.js';
import { AppErrorFilter } from './shared/http/app-error.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Traduction des catégories d'erreur en statuts — le seul point qui connaît HTTP.
  app.useGlobalFilters(new AppErrorFilter());

  // Le back-office Angular tourne sur un autre port en développement.
  app.enableCors({ origin: ['http://localhost:4200'] });

  // Le port passe par AppConfig comme toute autre valeur d'environnement.
  await app.listen(app.get(AppConfig).port());
}

void bootstrap();

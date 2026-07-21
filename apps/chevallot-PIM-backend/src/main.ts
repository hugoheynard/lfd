import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { AppConfig } from './infra/config/app-config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Le port passe par AppConfig comme toute autre valeur d'environnement.
  await app.listen(app.get(AppConfig).port());
}

void bootstrap();

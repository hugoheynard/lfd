import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DEV_CORS_ORIGINS, PROD_CORS_ORIGINS } from '@lfd/endpoints';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { AppConfig } from './infra/config/app-config.js';
import { AppErrorFilter } from './shared/http/app-error.filter.js';
import { QuietBootLogger } from './shared/quiet-boot-logger.js';

/** Plafond de taille du corps JSON : borne un vecteur de déni de service (payload géant). */
const JSON_BODY_LIMIT = '512kb';

async function bootstrap(): Promise<void> {
  // Logger de démarrage silencieux : masque l'énumération des routes/modules
  // (bruit en watch), garde erreurs/warnings — un montage qui échoue reste loud.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new QuietBootLogger(),
  });

  const config = app.get(AppConfig);

  // En-têtes de sécurité HTTP (CSP, HSTS, nosniff, anti-clickjacking…). API JSON pure.
  app.use(helmet());

  // Plafonne la taille du corps JSON (anti-DoS par payload géant).
  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });

  // Traduction des catégories d'erreur en statuts — le seul point qui connaît HTTP.
  app.useGlobalFilters(new AppErrorFilter());

  // Allowlist CORS **fermée** tenue dans `@lfd/endpoints` : origine Pages en prod,
  // localhost en dev. Une origine hors liste est refusée par le navigateur.
  app.enableCors({
    origin: config.isProduction()
      ? PROD_CORS_ORIGINS.pim
      : DEV_CORS_ORIGINS.pim,
  });

  // Le port passe par AppConfig comme toute autre valeur d'environnement.
  const port = config.port();
  try {
    // `0.0.0.0` explicite : requis en container (Cloudflare) pour être joignable
    // depuis le Worker.
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    if (isAddressInUse(error)) {
      // Cause quasi-certaine : un backend tourne déjà. On garde le port fixe (le
      // front y est épinglé) et on dit quoi faire, plutôt qu'une stack brute.
      process.stderr.write(
        `\n⛔ Port ${port} déjà utilisé — un backend tourne sans doute déjà.\n` +
          `   Libère-le puis relance :  lsof -ti:${port} | xargs kill\n\n`,
      );
      process.exit(1);
    }
    throw error;
  }
}

/** Vrai si l'erreur est un `EADDRINUSE` (port déjà pris). */
function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
  );
}

void bootstrap();

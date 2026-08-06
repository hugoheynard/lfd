import { NestFactory } from '@nestjs/core';
import { DEV_CORS_ORIGINS } from '@lfd/endpoints';
import { AppModule } from './app.module.js';
import { AppConfig } from './infra/config/app-config.js';
import { AppErrorFilter } from './shared/http/app-error.filter.js';
import { QuietBootLogger } from './shared/quiet-boot-logger.js';

async function bootstrap(): Promise<void> {
  // Logger de démarrage silencieux : masque l'énumération des routes/modules
  // (bruit en watch), garde erreurs/warnings — un montage qui échoue reste loud.
  const app = await NestFactory.create(AppModule, {
    logger: new QuietBootLogger(),
  });

  // Traduction des catégories d'erreur en statuts — le seul point qui connaît HTTP.
  app.useGlobalFilters(new AppErrorFilter());

  // Origines dev (front PIM + port spare) tenues dans le registre unique
  // `@lfd/endpoints` — le même port que le shell. La prod passe par l'env.
  app.enableCors({
    origin: DEV_CORS_ORIGINS.pim,
  });

  // Le port passe par AppConfig comme toute autre valeur d'environnement.
  const port = app.get(AppConfig).port();
  try {
    // `0.0.0.0` explicite : requis en container (Cloudflare) pour être joignable
    // depuis le Worker.
    await app.listen(port, "0.0.0.0");
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

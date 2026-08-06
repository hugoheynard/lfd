import { NestFactory } from "@nestjs/core";
import { DEV_CORS_ORIGINS } from "@lfd/endpoints";
import { AppModule } from "./app.module.js";
import { AppConfig } from "./infra/config/app-config.js";
import { AppErrorFilter } from "./shared/http/app-error.filter.js";
import { QuietBootLogger } from "./shared/quiet-boot-logger.js";

async function bootstrap(): Promise<void> {
  // Logger de démarrage silencieux : masque l'énumération des routes/modules
  // (bruit en watch), garde erreurs/warnings — un montage qui échoue reste loud.
  // `rawBody: true` : Express conserve le corps brut de chaque requête. Le webhook
  // Stripe en a besoin — Stripe signe les octets exacts du payload, un JSON
  // re-sérialisé casserait la vérification de signature.
  const app = await NestFactory.create(AppModule, {
    logger: new QuietBootLogger(),
    rawBody: true,
  });

  const config = app.get(AppConfig);

  // Traduction des catégories d'erreur en statuts — le seul point qui connaît HTTP.
  // Hors prod, le filtre joint le détail technique des 500 (le message reste neutre).
  app.useGlobalFilters(new AppErrorFilter(config.exposeErrorDetail()));

  // Origines dev (front B2B + port spare) tenues dans le registre unique
  // `@lfd/endpoints`. La prod passe par l'env.
  app.enableCors({
    origin: DEV_CORS_ORIGINS.b2b,
  });

  // Le port passe par AppConfig comme toute autre valeur d'environnement.
  const port = config.port();
  try {
    await app.listen(port);
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
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "EADDRINUSE";
}

void bootstrap();

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { AppConfig } from "./infra/config/app-config.js";
import { AppErrorFilter } from "./shared/http/app-error.filter.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Traduction des catégories d'erreur en statuts — le seul point qui connaît HTTP.
  app.useGlobalFilters(new AppErrorFilter());

  // Le front B2B tourne sur un autre port en développement : 7316 (Angular),
  // 4200 gardé pour un éventuel second front.
  app.enableCors({
    origin: ["http://localhost:7316", "http://localhost:4200"],
  });

  // Le port passe par AppConfig comme toute autre valeur d'environnement.
  const port = app.get(AppConfig).port();
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

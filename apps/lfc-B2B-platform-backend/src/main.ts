import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DEV_CORS_ORIGINS, PROD_CORS_ORIGINS } from "@lfd/endpoints";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import { AppConfig } from "./infra/config/app-config.js";
import { requestContextMiddleware } from "./infra/context/request-context.middleware.js";
import { AppErrorFilter } from "./shared/http/app-error.filter.js";
import { QuietBootLogger } from "./shared/quiet-boot-logger.js";

/** Plafond de taille du corps JSON : borne un vecteur de déni de service (payload géant). */
const JSON_BODY_LIMIT = "512kb";

async function bootstrap(): Promise<void> {
  // Logger de démarrage silencieux : masque l'énumération des routes/modules
  // (bruit en watch), garde erreurs/warnings — un montage qui échoue reste loud.
  // `rawBody: true` : Express conserve le corps brut de chaque requête. Le webhook
  // Stripe en a besoin — Stripe signe les octets exacts du payload, un JSON
  // re-sérialisé casserait la vérification de signature.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: new QuietBootLogger(),
    rawBody: true,
  });

  const config = app.get(AppConfig);

  // TOUT PREMIER : pose le RequestContext (instant gelé + traceId W3C) autour de
  // chaque requête, via AsyncLocalStorage. Avant helmet et avant les guards, pour
  // que logs, journal d'événements et filtre d'erreur voient toujours le contexte
  // — même sur une requête qui échoue tôt. Le temps métier (`Clock`) en découle.
  app.use(requestContextMiddleware);

  // En-têtes de sécurité HTTP (CSP, HSTS, nosniff, anti-clickjacking…). API JSON
  // pure : les défauts helmet conviennent, aucun asset HTML à assouplir.
  app.use(helmet());

  // Plafonne la taille du corps JSON (anti-DoS par payload géant). Le corps brut
  // du webhook Stripe (rawBody) reste géré — ses payloads sont petits, bien sous
  // la limite. Les uploads KBIS passent par multer (multipart), non concernés ici.
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
  app.useBodyParser("urlencoded", { limit: JSON_BODY_LIMIT, extended: true });

  // Traduction des catégories d'erreur en statuts — le seul point qui connaît HTTP.
  // Hors prod, le filtre joint le détail technique des 500 (le message reste neutre).
  app.useGlobalFilters(new AppErrorFilter(config.exposeErrorDetail()));

  // Allowlist CORS **fermée** tenue dans le registre unique `@lfd/endpoints` :
  // origines Pages en prod, localhost en dev. Une origine hors liste (dont un
  // site tiers) est refusée par le navigateur.
  app.enableCors({
    origin: config.isProduction() ? PROD_CORS_ORIGINS.b2b : DEV_CORS_ORIGINS.b2b,
  });

  // Le port passe par AppConfig comme toute autre valeur d'environnement.
  const port = config.port();
  try {
    // `0.0.0.0` explicite : requis en container (Cloudflare) pour être joignable
    // depuis le Worker ; sans hôte, Node bind déjà toutes les interfaces, mais on
    // le rend non ambigu pour l'image.
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
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "EADDRINUSE";
}

void bootstrap();

import { ServiceUnavailableException } from "@nestjs/common";

import type { AppConfig } from "../platform/config/app-config.js";

/**
 * **La serrure de l'outillage de développement**, à l'usage plutôt qu'au
 * démarrage — sortie de `DevSeedService` le 2026-10-05 pour servir aussi le
 * scénario par étapes (`DevScenarioService`), sans en écrire une seconde copie
 * qui dériverait.
 *
 * Au démarrage, elle empêcherait l'API de booter sur une machine mal
 * configurée — un refus disproportionné pour un outil de confort. Ici elle ne
 * refuse que le geste, et elle dit pourquoi.
 *
 * ⚠️ Elle lève une `HttpException` hors de `http/`, comme elle le faisait déjà
 * dans le service ; déplacée telle quelle, sans changer le statut qu'un écran
 * en ligne reçoit (503).
 */
export function refuseUnlessLocalDevelopment(config: AppConfig): void {
  if (config.isProduction()) {
    throw new ServiceUnavailableException(
      "Le rechargement du jeu de données n'existe pas en production.",
    );
  }
  const url = config.databaseUrl();
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) {
    throw new ServiceUnavailableException(
      "Base non locale : le rechargement n'écrit que vers un Postgres direct.",
    );
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new ServiceUnavailableException(
      `Base non locale (« ${host} ») : le rechargement supprime des sociétés et des commandes.`,
    );
  }
}

/**
 * Les hôtes acceptés comme « ma machine ». Une **liste blanche**, et non une
 * négation de l'hôte de production : ce qui n'est pas explicitement local doit
 * être refusé, y compris ce qu'on n'a pas pensé à interdire.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

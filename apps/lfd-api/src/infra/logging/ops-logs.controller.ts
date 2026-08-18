import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AppConfig } from "../config/app-config.js";
import { Public } from "../auth/public.decorator.js";
import { RecomputeGuard } from "../auth/recompute.guard.js";
import { RECENT_LOGS, type RecordedLog } from "./log-buffer.js";

/** Combien de lignes au maximum, quoi qu'on demande. */
const MAX_LINES = 200;
const DEFAULT_LINES = 50;

interface LogsReport {
  readonly revision: string;
  /** Nombre de lignes actuellement gardées par l'instance. */
  readonly kept: number;
  /** Les plus récentes d'abord. */
  readonly lines: readonly RecordedLog[];
}

/**
 * **Les dernières lignes d'incident de l'instance qui répond.**
 *
 * Cloudflare ne remonte pas la sortie d'un container : l'API `Container`
 * n'expose que la fin du process, et l'observabilité du Worker ne capte que le
 * Worker. Faute de chaînon, c'est l'application qui rend ce qu'elle a écrit.
 *
 * Derrière le **jeton d'exploitation**, comme les autres contrôles — et ici la
 * raison est plus forte qu'ailleurs : une ligne de journal peut porter une
 * adresse e-mail ou un identifiant. C'est la contrepartie assumée d'un
 * diagnostic utile ; ce qui n'a jamais le droit d'y figurer, ce sont les
 * secrets, et aucun n'est journalisé.
 *
 * Ce que cette route **ne fait pas** : conserver. Le tampon est vivant, borné,
 * perdu au redémarrage, et propre à l'instance. Elle répond à « que vient-il de
 * se passer ? », pas à « qu'est-il arrivé cette nuit ? ».
 */
@Controller("admin/ops/logs")
@Public()
@UseGuards(RecomputeGuard)
export class OpsLogsController {
  constructor(private readonly config: AppConfig) {}

  @Get()
  logs(@Query("limit") limit?: string): LogsReport {
    return {
      revision: this.config.revision(),
      kept: RECENT_LOGS.size(),
      lines: RECENT_LOGS.recent(linesAsked(limit)),
    };
  }
}

/** Une demande absente, illisible ou démesurée retombe sur des bornes sûres. */
function linesAsked(raw: string | undefined): number {
  const asked = Number.parseInt(raw ?? "", 10);
  return Number.isNaN(asked) ? DEFAULT_LINES : Math.min(Math.max(asked, 1), MAX_LINES);
}

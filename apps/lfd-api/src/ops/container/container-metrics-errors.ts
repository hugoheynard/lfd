import { TechnicalError } from "../../platform/shared/errors/app-error.js";

/** `forbidden` : le jeton n'a pas le droit ; `unavailable` : tout le reste. */
export type ContainerMetricsFailure = "forbidden" | "unavailable";

/**
 * La lecture des métriques du container a échoué.
 *
 * Technique, comme celle du trafic : c'est la carte qui ne voit plus, pas l'API
 * qui tombe. Elle ne remonte jamais en 500 — le service la convertit en une
 * case « non mesuré » qui dit pourquoi.
 */
export class ContainerMetricsUnavailableError extends TechnicalError {
  constructor(
    readonly failure: ContainerMetricsFailure,
    message: string,
    cause?: unknown,
  ) {
    super("ops.container_metrics_unavailable", message, cause);
  }
}

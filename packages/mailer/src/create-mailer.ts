import { CircuitBreakerMailer } from "./circuit-breaker.js";
import { DryRunMailer } from "./dry-run-mailer.js";
import { createResendMailer } from "./resend-mailer.js";
import type { Mailer, MailerLogger, TemplateMap, TemplateRegistry } from "./types.js";

export interface CreateMailerConfig<M extends TemplateMap> {
  /**
   * La clé Resend. **Absente ou vide ⇒ mode à blanc** — c'est ce qui fait qu'un
   * développement local, une CI et un test tournent sans compte fournisseur, et
   * qu'un oubli de clé en production se voit dans le journal plutôt que de faire
   * tomber le démarrage.
   */
  readonly apiKey?: string | null;
  readonly registry: TemplateRegistry<M>;
  readonly fromAddress: string;
  readonly replyTo?: string | null;
  readonly logger?: MailerLogger;
  /** Réglages du disjoncteur — les défauts conviennent presque toujours. */
  readonly circuitBreaker?: { threshold?: number; cooldownMs?: number };
}

/**
 * **Le point d'entrée d'une app** : une clé, un registre, une adresse.
 *
 * Choisit l'adaptateur au démarrage — à blanc sans clé, sinon Resend enveloppé
 * dans son disjoncteur. Cette décision vit ici et non dans chaque app pour
 * qu'aucune n'oublie le disjoncteur, ni ne se retrouve à envoyer pour de vrai
 * depuis un environnement qui ne devait pas.
 */
export function createMailer<M extends TemplateMap>(config: CreateMailerConfig<M>): Mailer<M> {
  const apiKey = config.apiKey?.trim() ?? "";
  if (apiKey === "") {
    return new DryRunMailer<M>(config.registry, config.logger);
  }
  const live = createResendMailer<M>({
    apiKey,
    registry: config.registry,
    fromAddress: config.fromAddress,
    replyTo: config.replyTo ?? null,
    ...(config.logger !== undefined ? { logger: config.logger } : {}),
  });
  return new CircuitBreakerMailer<M>(live, {
    ...config.circuitBreaker,
    ...(config.logger !== undefined ? { logger: config.logger } : {}),
  });
}

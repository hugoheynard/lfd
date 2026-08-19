import { MailerCircuitOpenError } from "./errors.js";
import { silentLogger } from "./types.js";
import type { Mailer, MailerLogger, MailReceipt, SendMailArgs, TemplateMap } from "./types.js";

const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOLDOWN_MS = 30_000;

export interface CircuitBreakerOptions {
  /** Échecs consécutifs qui ouvrent le disjoncteur. */
  readonly threshold?: number;
  /** Durée pendant laquelle on échoue vite avant de retenter. */
  readonly cooldownMs?: number;
  /** Horloge injectable — un test ne doit pas attendre trente secondes. */
  readonly now?: () => number;
  readonly logger?: MailerLogger;
}

/**
 * Disjoncteur autour du mailer.
 *
 * Quand le fournisseur est tombé, chaque envoi brûlerait son délai d'attente
 * complet avant d'échouer : les envois s'empilent et on inonde un service déjà
 * à terre. Après `threshold` échecs consécutifs, le disjoncteur s'**ouvre** et
 * les envois échouent **immédiatement** (`MailerCircuitOpenError`, retryable)
 * pendant `cooldownMs`. Passé ce délai, **un** essai est autorisé : s'il passe,
 * le disjoncteur se referme ; sinon il se rouvre.
 *
 * Rien n'est perdu — c'est à la relance de l'appelant de rejouer l'envoi. On
 * arrête seulement de frapper.
 */
export class CircuitBreakerMailer<M extends TemplateMap> implements Mailer<M> {
  private failures = 0;
  private openUntil = 0;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly log: MailerLogger;

  constructor(
    private readonly inner: Mailer<M>,
    options: CircuitBreakerOptions = {},
  ) {
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = options.now ?? ((): number => Date.now());
    this.log = options.logger ?? silentLogger;
  }

  get enabled(): boolean {
    return this.inner.enabled;
  }

  async send<K extends keyof M>(args: SendMailArgs<M, K>): Promise<MailReceipt> {
    if (this.isOpen()) {
      throw new MailerCircuitOpenError(this.openUntil);
    }
    try {
      const receipt = await this.inner.send(args);
      this.failures = 0; // un succès — y compris l'essai de reprise — referme.
      return receipt;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return this.failures >= this.threshold && this.now() < this.openUntil;
  }

  private recordFailure(): void {
    this.failures += 1;
    if (this.failures < this.threshold) {
      return;
    }
    this.openUntil = this.now() + this.cooldownMs;
    this.log.error("Disjoncteur e-mail OUVERT", {
      failures: this.failures,
      cooldownMs: this.cooldownMs,
    });
  }
}

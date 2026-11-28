import {
  Injectable,
  SetMetadata,
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { ResupplySwitchReader } from "../domain/resupply-switch.reader.js";
import { ResupplyDisabledError } from "../domain/resupply-switch-errors.js";

/** Les verbes qui ne font que lire : ils passent, réassort éteint ou non. */
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/** La clé de métadonnée d'une route qui passe réassort éteint. */
const PASSES_WHEN_OFF = "resupply:passes-when-off";

/**
 * Laisse passer une écriture **réassort éteint** : la suite d'un réassort
 * déjà envoyé (le recevoir, le corriger, le dire monté, l'annuler). Éteindre
 * empêche d'en envoyer un neuf, jamais de finir ceux qui sont en route
 * (décidé par Hugo le 2026-11-28). La raison est obligatoire : elle se lit
 * à côté de la route.
 */
export function PassesWhenResupplyOff(reason: string): CustomDecorator<string> {
  return SetMetadata(PASSES_WHEN_OFF, reason);
}

/** Requête réduite à ce que le garde lit (le verbe). */
interface MethodRequest {
  readonly method: string;
}

/**
 * **Le refus du réassort éteint**, posé sur les contrôleurs du réassort. Un
 * garde plutôt qu'un test dans chaque handler : une vingtaine de cas
 * d'écriture, et un oubli serait silencieux. Les lectures passent — ce qui a
 * été envoyé reste lisible. Posé au contrôleur, il tourne après les gardes
 * globaux : un appelant sans droit reçoit son 403 avant le 409. Une route
 * marquée {@link PassesWhenResupplyOff} passe aussi : elle finit un réassort
 * déjà envoyé.
 *
 * @throws {ResupplyDisabledError} une écriture alors que le réassort est éteint.
 */
@Injectable()
export class ResupplyEnabledGuard implements CanActivate {
  constructor(
    private readonly switches: ResupplySwitchReader,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { method } = context.switchToHttp().getRequest<MethodRequest>();
    if (READ_METHODS.has(method.toUpperCase())) {
      return true;
    }
    if (
      this.reflector.get<string | undefined>(PASSES_WHEN_OFF, context.getHandler()) !== undefined
    ) {
      return true;
    }
    if (!(await this.switches.isEnabled())) {
      throw new ResupplyDisabledError();
    }
    return true;
  }
}

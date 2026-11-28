import { Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";

import { ResupplySwitchReader } from "../domain/resupply-switch.reader.js";
import { ResupplyDisabledError } from "../domain/resupply-switch-errors.js";

/** Les verbes qui ne font que lire : ils passent, réassort éteint ou non. */
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/** Requête réduite à ce que le garde lit (le verbe). */
interface MethodRequest {
  readonly method: string;
}

/**
 * **Le refus du réassort éteint**, posé sur les contrôleurs du réassort. Un
 * garde plutôt qu'un test dans chaque handler : une vingtaine de cas
 * d'écriture, et un oubli serait silencieux. Les lectures passent — ce qui a
 * été envoyé reste lisible. Posé au contrôleur, il tourne après les gardes
 * globaux : un appelant sans droit reçoit son 403 avant le 409.
 *
 * @throws {ResupplyDisabledError} une écriture alors que le réassort est éteint.
 */
@Injectable()
export class ResupplyEnabledGuard implements CanActivate {
  constructor(private readonly switches: ResupplySwitchReader) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { method } = context.switchToHttp().getRequest<MethodRequest>();
    if (READ_METHODS.has(method.toUpperCase())) {
      return true;
    }
    if (!(await this.switches.isEnabled())) {
      throw new ResupplyDisabledError();
    }
    return true;
  }
}

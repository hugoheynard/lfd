import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { attachActor } from "../../../platform/context/request-context.store.js";
import { resolveClientIp } from "../../../platform/security/client-ip.js";
import { ExportReaderAdmission } from "../application/services/export-reader-admission.js";

/** L'en-tête de la clé d'export — à elle, jamais `Authorization`, que la garde Auth0 lit. */
export const EXPORT_KEY_HEADER = "x-export-key";

/** Le préfixe de l'acteur posé : `export-reader:<id de la clé>`. */
const ACTOR_PREFIX = "export-reader:";

/**
 * **La garde de l'export des ventes** (plan
 * `documentation/commandes/export/plan-export-des-ventes.md`, § 6.1, § 6.5).
 *
 * Lit `X-Export-Key` — et lui seul : un `Authorization: Bearer` est ignoré —,
 * le fait admettre par la clé (haché, non révoquée, non échue, adresse
 * admise lue sur `x-lfc-client-ip`), et pose l'acteur `system`
 * `export-reader:<id>`, comme `RecomputeGuard` pose le sien : l'usage se lit
 * dans les journaux de requête par cet id. Elle n'écrit rien.
 *
 * Un refus ne dit pas si la clé existe : inconnue, révoquée, échue ou
 * présentée d'ailleurs rendent le même 401.
 */
@Injectable()
export class ExportReaderKeyGuard implements CanActivate {
  constructor(private readonly admission: ExportReaderAdmission) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const secret = presentedSecret(request);
    if (secret === null) {
      throw new UnauthorizedException(
        "Clé d'export absente : l'appel doit porter l'en-tête X-Export-Key (pas Authorization).",
      );
    }
    const keyId = await this.admission.admit(secret, resolveClientIp(request));
    if (keyId === null) {
      throw new UnauthorizedException(
        "Clé d'export refusée : inconnue, révoquée, échue, ou présentée depuis une adresse non admise. Demandez une nouvelle clé au back-office.",
      );
    }
    attachActor({ type: "system", id: `${ACTOR_PREFIX}${keyId}` });
    return true;
  }
}

/** La valeur de l'en-tête, trimée ; `null` si elle manque ou est vide. */
function presentedSecret(request: Record<string, unknown>): string | null {
  const headers = request["headers"];
  if (typeof headers !== "object" || headers === null) {
    return null;
  }
  const raw: unknown = (headers as Record<string, unknown>)[EXPORT_KEY_HEADER];
  const first: unknown = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") {
    return null;
  }
  const trimmed = first.trim();
  return trimmed === "" ? null : trimmed;
}

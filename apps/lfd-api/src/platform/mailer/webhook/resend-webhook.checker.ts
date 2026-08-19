import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";

import { AppConfig } from "../../config/app-config.js";
import {
  checkDeclaration,
  type DeclarationVerdict,
  type DeclaredWebhook,
} from "./webhook-declaration.js";

/** L'appel n'a pas le droit de retenir un démarrage. */
const LIST_TIMEOUT_MS = 3000;

/**
 * **Interroge Resend sur l'état de notre webhook**, au démarrage et à la demande.
 *
 * Au démarrage, parce que c'est le moment où l'on regarde : le rapport de boot
 * dit déjà ce qui est éteint, et un webhook absent ou désactivé éteint quelque
 * chose que rien d'autre ne signale. Sans cette ligne, « les rebonds ne
 * remontent plus » est indiscernable de « personne ne rebondit ».
 *
 * **En lecture seule.** Déclarer le webhook depuis le code muterait l'état d'un
 * tiers à chaque boot : un poste local lancé avec la clé de production
 * repointerait le vrai webhook vers lui-même. La création reste un geste
 * délibéré ; la vérification tourne en continu.
 */
@Injectable()
export class ResendWebhookChecker implements OnApplicationBootstrap {
  private readonly logger = new Logger(ResendWebhookChecker.name);

  constructor(private readonly config: AppConfig) {}

  onApplicationBootstrap(): void {
    // Sans `await` : un tiers lent ne doit pas retarder l'ouverture du port.
    // Le résultat part au journal, et l'écran de santé le redemandera.
    void this.check().then((verdict) => {
      if (verdict !== null && !verdict.healthy) {
        this.logger.error(`· Retour du courrier — ${verdict.detail}`);
      }
    });
  }

  /** Le verdict, ou `null` si on ne peut pas demander (pas de clé, tiers muet). */
  async check(): Promise<DeclarationVerdict | null> {
    const { apiKey } = this.config.mailerConfig();
    if (apiKey === null) {
      return null;
    }
    try {
      const response = await fetch("https://api.resend.com/webhooks", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(LIST_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Liste des webhooks Resend refusée (${response.status})`);
        return null;
      }
      return checkDeclaration(readWebhooks(await response.json()));
    } catch (error) {
      // Ne rien savoir n'est pas savoir que c'est cassé : on rend `null`, et le
      // relevé s'abstient plutôt que d'accuser.
      this.logger.warn("État du webhook Resend indisponible", error);
      return null;
    }
  }
}

/** Lit la liste **défensivement** : elle vient du réseau. */
function readWebhooks(payload: unknown): readonly DeclaredWebhook[] {
  if (typeof payload !== "object" || payload === null || !("data" in payload)) {
    return [];
  }
  const data: unknown = payload.data;
  return Array.isArray(data) ? data.flatMap((entry: unknown) => toWebhook(entry)) : [];
}

function toWebhook(entry: unknown): readonly DeclaredWebhook[] {
  if (typeof entry !== "object" || entry === null) {
    return [];
  }
  const endpoint = readString(entry, "endpoint");
  if (endpoint === null) {
    return [];
  }
  return [
    {
      endpoint,
      status: readString(entry, "status") ?? "unknown",
      events: readEvents(entry),
    },
  ];
}

function readEvents(entry: object): readonly string[] {
  const events: unknown = "events" in entry ? entry.events : null;
  return Array.isArray(events) ? events.filter((one: unknown) => typeof one === "string") : [];
}

function readString(source: object, key: string): string | null {
  const value: unknown = key in source ? Reflect.get(source, key) : null;
  return typeof value === "string" && value !== "" ? value : null;
}

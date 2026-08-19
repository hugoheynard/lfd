import type { MailStatus } from "../journal/mail-journal.port.js";

/**
 * **Ce qu'on retient d'un événement Resend**, et rien d'autre.
 *
 * La charge est lue **défensivement** : elle vient du réseau, et une forme
 * inattendue doit donner « je ne sais pas quoi en faire » plutôt qu'une
 * exception au milieu d'un webhook — un `500` ferait réessayer Resend
 * indéfiniment pour un message qu'on ne saura jamais lire.
 */
export interface ResendEvent {
  readonly status: MailStatus;
  readonly providerId: string;
  readonly detail: string;
}

/**
 * Les types qu'on traite. `email.opened` et `email.clicked` sont **écartés
 * exprès** : ils disent ce qu'une personne a fait de son courrier, ce qui ne
 * nous regarde pas, et ils représenteraient l'essentiel du volume pour une
 * information dont aucune décision ne dépend.
 */
const STATUS_OF_TYPE: Readonly<Record<string, MailStatus>> = {
  "email.sent": "sent",
  "email.delivery_delayed": "delayed",
  "email.delivered": "delivered",
  "email.complained": "complained",
  "email.bounced": "bounced",
};

/** Lit un événement, ou rend `null` si on ne sait pas quoi en faire. */
export function readResendEvent(payload: unknown): ResendEvent | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const type = readString(payload, "type");
  const status = type === null ? undefined : STATUS_OF_TYPE[type];
  if (status === undefined) {
    return null;
  }
  const data: unknown = "data" in payload ? payload.data : null;
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const providerId = readString(data, "email_id");
  if (providerId === null) {
    return null;
  }
  return { status, providerId, detail: reasonOf(data) };
}

/** La raison d'un rejet, quand le fournisseur en donne une. */
function reasonOf(data: object): string {
  const bounce: unknown = "bounce" in data ? data.bounce : null;
  if (typeof bounce === "object" && bounce !== null) {
    return readString(bounce, "message") ?? readString(bounce, "type") ?? "";
  }
  return "";
}

function readString(source: object, key: string): string | null {
  if (!(key in source)) {
    return null;
  }
  const value: unknown = Reflect.get(source, key);
  return typeof value === "string" && value !== "" ? value : null;
}

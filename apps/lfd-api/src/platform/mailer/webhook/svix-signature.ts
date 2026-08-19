import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * **Vérification d'un webhook Svix** — le schéma que Resend utilise.
 *
 * Pur et testable : rien ici ne connaît Nest, Express ni Resend. Ce qui peut se
 * tromper vit ici, sous tests ; ce qui ne peut que transporter vit dans le
 * contrôleur — le même partage que `routes.ts` côté passerelle.
 *
 * Le secret a la forme `whsec_<base64>`, et c'est la partie **décodée** qui sert
 * de clé. On signe la concaténation `{id}.{timestamp}.{corps brut}` en
 * HMAC-SHA256, rendue en base64.
 */

/** Au-delà, on refuse : un message rejoué hors de cette fenêtre n'est plus le nôtre. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Le verdict. Une **union** et non un booléen : « pas de signature », « signature
 * fausse » et « trop vieux » appellent trois lectures différentes dans le
 * journal, et un booléen les aurait confondues au moment précis où quelqu'un
 * essaie de comprendre pourquoi rien n'arrive.
 */
export type SignatureVerdict = "ok" | "missing" | "invalid" | "stale" | "unconfigured";

export interface SvixHeaders {
  readonly id: string | undefined;
  readonly timestamp: string | undefined;
  readonly signature: string | undefined;
}

export interface VerifyInput {
  readonly secret: string | null;
  readonly headers: SvixHeaders;
  readonly body: string;
  readonly nowMs: number;
}

export function verifySvixSignature(input: VerifyInput): SignatureVerdict {
  const { secret, headers, body, nowMs } = input;
  if (secret === null || secret === "") {
    // Non configuré : on ne peut RIEN prouver. Accepter « parce qu'on n'a pas
    // le secret » ouvrirait la route à n'importe qui, et c'est le seul endroit
    // du système où l'on fait confiance à un appel externe.
    return "unconfigured";
  }
  if (headers.id === undefined || headers.timestamp === undefined) {
    return "missing";
  }
  if (headers.signature === undefined || headers.signature === "") {
    return "missing";
  }
  if (!isFresh(headers.timestamp, nowMs)) {
    return "stale";
  }
  const expected = sign(secret, `${headers.id}.${headers.timestamp}.${body}`);
  return matchesAny(headers.signature, expected) ? "ok" : "invalid";
}

/** L'horodatage est-il dans la fenêtre ? Protège du rejeu d'un message capté. */
function isFresh(timestamp: string, nowMs: number): boolean {
  const seconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(seconds)) {
    return false;
  }
  return Math.abs(nowMs - seconds * 1000) <= SIGNATURE_TOLERANCE_MS;
}

/** HMAC-SHA256 de la charge signée, en base64. */
function sign(secret: string, signedContent: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(signedContent).digest("base64");
}

/**
 * L'en-tête porte **plusieurs** signatures, séparées par des espaces, chacune
 * préfixée de sa version (`v1,<base64>`). C'est ce qui permet de tourner un
 * secret sans coupure : pendant la bascule, les deux sont émises. En refuser
 * une au motif qu'il y en a plusieurs rendrait la rotation impossible sans
 * perdre des événements.
 */
function matchesAny(header: string, expected: string): boolean {
  return header
    .split(" ")
    .filter((entry) => entry.startsWith("v1,"))
    .some((entry) => constantTimeEquals(entry.slice("v1,".length), expected));
}

/**
 * Comparaison à **temps constant**. Un `===` classique s'arrête au premier
 * octet différent : le temps de réponse révélerait alors, octet par octet, la
 * signature attendue.
 */
function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Au-delà, l'agence refuse : une notification rejouée hors de cette fenêtre
 * n'est plus la nôtre. La même que Stripe et Resend (`svix-signature.ts`).
 */
export const VITRINE_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

const VERSION = "v1";

/**
 * **La signature d'une notification** — le schéma de Stripe : l'en-tête
 * `Vitrine-Signature: t=<secondes>,v1=<hex>`, où `v1` est le HMAC-SHA256,
 * sous le secret de l'abonné, de `<t>.<corps brut>`.
 *
 * L'horodatage est DANS la charge signée : le changer casse la signature. Une
 * agence qui refuse un `t` hors de la fenêtre refuse donc un rejeu, sans
 * rien garder en mémoire ; l'en-tête `Vitrine-Delivery` (l'id de la
 * livraison) lui permet en plus d'écarter un doublon dans la fenêtre.
 */
export function signVitrineBody(secret: string, body: string, timestampSeconds: number): string {
  const t = String(Math.trunc(timestampSeconds));
  return `t=${t},${VERSION}=${hmac(secret, `${t}.${body}`)}`;
}

/** Le verdict, que l'agence reproduit chez elle (et que nos tests éprouvent). */
export type VitrineSignatureVerdict = "ok" | "missing" | "invalid" | "stale";

export function verifyVitrineSignature(input: {
  readonly secret: string;
  readonly header: string | undefined;
  readonly body: string;
  readonly nowSeconds: number;
}): VitrineSignatureVerdict {
  const parts = parse(input.header);
  if (parts === null) {
    return "missing";
  }
  if (Math.abs(input.nowSeconds - parts.timestamp) > VITRINE_SIGNATURE_TOLERANCE_SECONDS) {
    return "stale";
  }
  const expected = hmac(input.secret, `${String(parts.timestamp)}.${input.body}`);
  return constantTimeEquals(parts.signature, expected) ? "ok" : "invalid";
}

function parse(
  header: string | undefined,
): { readonly timestamp: number; readonly signature: string } | null {
  if (header === undefined || header === "") {
    return null;
  }
  const fields = new Map(
    header.split(",").map((part) => {
      const [name = "", ...value] = part.trim().split("=");
      return [name, value.join("=")] as const;
    }),
  );
  const timestamp = Number.parseInt(fields.get("t") ?? "", 10);
  const signature = fields.get(VERSION);
  if (!Number.isFinite(timestamp) || signature === undefined || signature === "") {
    return null;
  }
  return { timestamp, signature };
}

function hmac(secret: string, content: string): string {
  return createHmac("sha256", secret).update(content, "utf8").digest("hex");
}

/** À temps constant : un `===` révélerait la signature attendue octet par octet. */
function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

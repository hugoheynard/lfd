import { EmailAddress } from "../../account/domain/value-objects/email-address.js";
import type { EmailAuthentication } from "./customer-request-details.js";

/**
 * **Ce qu'on lit d'un e-mail reçu avant de le ranger** — pur (plan
 * `documentation/demandes-client/plan-reponses-par-e-mail.md`, §2) :
 * l'expéditeur, la réponse automatique, le verdict d'authentification, le
 * numéro de commande cité par l'objet.
 *
 * Rien de tout cela n'authentifie quelqu'un : l'adresse `From` se forge, et
 * tout rattachement qu'on en tire est PRÉSUMÉ.
 */

/** Les en-têtes du message, tels que Resend les rend (noms dans leur casse d'origine). */
export type MessageHeaders = Readonly<Record<string, string>>;

/** L'expéditeur lu dans `From` : son nom affiché (peut être vide) et son adresse normalisée. */
export interface MessageSender {
  readonly name: string;
  readonly email: string;
}

const ANGLED = /^(.*)<([^<>]+)>\s*$/u;

/**
 * L'expéditeur de `From` (`Jean Martin <jean@x.fr>`, `"Martin, Jean" <…>`,
 * ou l'adresse seule), ou `null` si l'adresse ne se lit pas.
 */
export function readSender(from: string): MessageSender | null {
  const angled = ANGLED.exec(from.trim());
  const rawEmail = angled === null ? from : (angled[2] ?? "");
  const rawName = angled === null ? "" : (angled[1] ?? "");
  try {
    return {
      name: rawName
        .trim()
        .replace(/^"(.*)"$/u, "$1")
        .trim(),
      email: EmailAddress.create(rawEmail).value,
    };
  } catch {
    return null;
  }
}

/** La valeur d'un en-tête, quelle que soit la casse de son nom ; `null` s'il manque. */
export function headerOf(headers: MessageHeaders, name: string): string | null {
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === wanted);
  return key === undefined ? null : (headers[key] ?? null);
}

const AUTOMATIC_PRECEDENCES: ReadonlySet<string> = new Set(["bulk", "auto_reply", "list"]);

/**
 * Une réponse AUTOMATIQUE (« absent du bureau », liste de diffusion) :
 * `Auto-Submitted` autre que `no` (RFC 3834), ou `Precedence` `bulk`,
 * `auto_reply` ou `list`. Rangée, elle ferait une demande et une sonnerie à
 * chaque e-mail envoyé.
 */
export function isAutomaticReply(headers: MessageHeaders): boolean {
  const submitted = headerOf(headers, "Auto-Submitted")?.trim().toLowerCase() ?? null;
  if (submitted !== null && submitted !== "" && submitted !== "no") {
    return true;
  }
  const precedence = headerOf(headers, "Precedence")?.trim().toLowerCase() ?? "";
  return AUTOMATIC_PRECEDENCES.has(precedence);
}

const UNKNOWN = "unknown";

/** Le verdict quand le message ne dit rien. */
export const UNKNOWN_AUTHENTICATION: EmailAuthentication = {
  spf: UNKNOWN,
  dkim: UNKNOWN,
  dmarc: UNKNOWN,
  dkimAligned: false,
};

/**
 * Le verdict de `Authentication-Results` pour un expéditeur de ce domaine.
 * DKIM est ALIGNÉ quand une signature valide vient du domaine de l'adresse,
 * ou d'un domaine parent (alignement relâché de DMARC).
 */
export function authenticationOf(
  headers: MessageHeaders,
  senderEmail: string,
): EmailAuthentication {
  const results = headerOf(headers, "Authentication-Results");
  if (results === null) {
    return UNKNOWN_AUTHENTICATION;
  }
  const clauses = results.split(";").map((clause) => clause.trim().toLowerCase());
  const domain = senderEmail.slice(senderEmail.lastIndexOf("@") + 1).toLowerCase();
  return {
    spf: resultOf(clauses, "spf"),
    dkim: resultOf(clauses, "dkim"),
    dmarc: resultOf(clauses, "dmarc"),
    dkimAligned: clauses.some((clause) => isAlignedDkimPass(clause, domain)),
  };
}

function resultOf(clauses: readonly string[], method: string): string {
  const pattern = new RegExp(`^${method}=([a-z]+)`, "u");
  for (const clause of clauses) {
    const match = pattern.exec(clause);
    if (match?.[1] !== undefined) {
      return match[1];
    }
  }
  return UNKNOWN;
}

function isAlignedDkimPass(clause: string, domain: string): boolean {
  if (!clause.startsWith("dkim=pass")) {
    return false;
  }
  const signer = /header\.d=([a-z0-9.-]+)/u.exec(clause)?.[1];
  return signer !== undefined && (domain === signer || domain.endsWith(`.${signer}`));
}

/**
 * Le numéro de commande cité par l'objet (`ORD-<n>` ou l'ancien
 * `ORD-<8>-<4>`, la forme du CHECK `orders_order_number_format`), ou `null`.
 * L'ancienne forme est cherchée d'abord : `ORD-1234ABCD-…` n'est pas `ORD-1234`.
 */
export function orderNumberIn(subject: string): string | null {
  const match = /\bORD-(?:[A-Z0-9]{8}-[A-Z0-9]{4}|[1-9][0-9]*)\b/u.exec(subject.toUpperCase());
  return match?.[0] ?? null;
}

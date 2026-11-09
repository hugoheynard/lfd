import type { MailNature } from "./mail-document.js";
import type { MailEditorStamp } from "./mail-editor-routes.js";
import type { MailSpace } from "./mail-spaces.js";

/**
 * **L'identité d'envoi d'un espace** (plan `plan-editeur-par-blocs.md`,
 * § 25, C3) — « une marque = un espace = une charte = une identité
 * d'envoi ». Le nom affiché, l'adresse d'envoi (sur un domaine vérifié chez
 * Resend), l'adresse de réponse.
 *
 * `replyToAddress` reste `null` À LA LECTURE : une identité enregistrée avant
 * la décision du 2026-11-07 (adresse de réponse obligatoire) n'en a pas, et
 * elle envoie comme avant — ses réponses vont à l'adresse d'envoi. Un nouvel
 * enregistrement, lui, la refuse (`validateMailSenderIdentity`).
 */
export interface MailSenderIdentity {
  readonly senderName: string;
  readonly fromAddress: string;
  readonly replyToAddress: string | null;
}

/** Le plus long nom d'expéditeur admis (la colonne en porte autant). */
export const MAX_SENDER_NAME_LENGTH = 80;

/** La plus longue adresse admise (RFC 5321 : 254 caractères). */
export const MAX_SENDER_ADDRESS_LENGTH = 254;

/** Les champs que les règles visent. */
export type MailSenderField = keyof MailSenderIdentity;

/** Les codes des refus de forme. */
export const MAIL_SENDER_VIOLATION_CODES = [
  "sender_name_empty",
  "sender_name_too_long",
  "sender_name_forbidden_character",
  "address_invalid",
  "reply_to_missing",
  "reply_to_unattended",
] as const;

export type MailSenderViolationCode = (typeof MAIL_SENDER_VIOLATION_CODES)[number];

/** Un refus, écrit pour l'équipe. */
export interface MailSenderViolation {
  readonly code: MailSenderViolationCode;
  readonly field: MailSenderField;
  readonly message: string;
}

/**
 * Les parties locales d'une adresse que personne ne lit (décision du
 * 2026-11-07) : une réponse qui y part est perdue. Comparées sans casse ni
 * séparateur (`.`, `-`, `_`, `+`), d'où une écriture sans séparateur ici.
 */
export const UNATTENDED_LOCAL_PARTS: readonly string[] = ["noreply", "donotreply", "nepasrepondre"];

const SEPARATORS = /[.\-_+]/g;

/** `No_Reply@lfd.fr` → vrai : la partie locale désigne une adresse qui ne reçoit rien. */
export function isUnattendedAddress(address: string): boolean {
  const local = address.slice(0, address.lastIndexOf("@")).toLowerCase().replace(SEPARATORS, "");
  return UNATTENDED_LOCAL_PARTS.includes(local);
}

/*
 * Une adresse : une partie locale sans espace ni chevron, un `@`, un domaine
 * d'au moins deux étiquettes. Volontairement étroite — elle devient un
 * en-tête `From:` ; Resend refuse de toute façon ce qu'elle laisserait passer.
 */
const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/* Ce qu'un nom d'expéditeur ne porte pas : il est mis entre guillemets dans l'en-tête. */
const FORBIDDEN_IN_NAME = new Set(['"', "<", ">", "\\"]);
const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;

function hasForbiddenCharacter(name: string): boolean {
  return [...name].some((char) => {
    const code = char.codePointAt(0) ?? 0;
    return FORBIDDEN_IN_NAME.has(char) || code < FIRST_PRINTABLE || code === DELETE;
  });
}

function addressViolation(
  field: "fromAddress" | "replyToAddress",
  value: string,
): MailSenderViolation | null {
  if (value.length <= MAX_SENDER_ADDRESS_LENGTH && ADDRESS.test(value)) {
    return null;
  }
  const label = field === "fromAddress" ? "L'adresse d'envoi" : "L'adresse de réponse";
  return {
    code: "address_invalid",
    field,
    message: `${label} « ${value} » n'est pas une adresse e-mail : écrivez-la sous la forme nom@domaine.fr.`,
  };
}

function nameViolation(name: string): MailSenderViolation | null {
  if (name.trim() === "") {
    return {
      code: "sender_name_empty",
      field: "senderName",
      message:
        "Le nom d'expéditeur est vide : écrivez le nom que les destinataires verront (« La Folie Douce »).",
    };
  }
  if (name.length > MAX_SENDER_NAME_LENGTH) {
    return {
      code: "sender_name_too_long",
      field: "senderName",
      message: `Le nom d'expéditeur dépasse ${String(MAX_SENDER_NAME_LENGTH)} caractères : raccourcissez-le.`,
    };
  }
  if (hasForbiddenCharacter(name)) {
    return {
      code: "sender_name_forbidden_character",
      field: "senderName",
      message:
        "Le nom d'expéditeur contient un guillemet, un chevron, une barre oblique inverse ou un retour à la ligne : retirez-les.",
    };
  }
  return null;
}

const REPLY_TO_LOST =
  "Les réponses à vos e-mails seraient perdues : choisissez une adresse que quelqu'un lit (par exemple support@…).";

function replyToViolation(replyTo: string | null): MailSenderViolation | null {
  if (replyTo === null) {
    return { code: "reply_to_missing", field: "replyToAddress", message: REPLY_TO_LOST };
  }
  const malformed = addressViolation("replyToAddress", replyTo);
  if (malformed !== null) {
    return malformed;
  }
  return isUnattendedAddress(replyTo)
    ? { code: "reply_to_unattended", field: "replyToAddress", message: REPLY_TO_LOST }
    : null;
}

function presentOnly(
  violations: readonly (MailSenderViolation | null)[],
): readonly MailSenderViolation[] {
  return violations.filter((violation): violation is MailSenderViolation => violation !== null);
}

/**
 * Les règles d'une identité qu'on ENREGISTRE : forme, et une adresse de
 * réponse obligatoire que quelqu'un lit (décision du 2026-11-07). Le domaine
 * vérifié chez Resend n'en est pas : il se lit chez le fournisseur, par le
 * serveur seul.
 */
export function validateMailSenderIdentity(
  identity: MailSenderIdentity,
): readonly MailSenderViolation[] {
  return presentOnly([
    nameViolation(identity.senderName),
    addressViolation("fromAddress", identity.fromAddress),
    replyToViolation(identity.replyToAddress),
  ]);
}

/**
 * Les règles d'une identité qu'on RELIT : la forme seule. Une identité rangée
 * avant le 2026-11-07, sans adresse de réponse ou avec un `no-reply`, reste
 * lisible et envoie comme avant ; elle n'est refusée qu'au prochain
 * enregistrement.
 */
export function validateStoredMailSenderIdentity(
  identity: MailSenderIdentity,
): readonly MailSenderViolation[] {
  return presentOnly([
    nameViolation(identity.senderName),
    addressViolation("fromAddress", identity.fromAddress),
    identity.replyToAddress === null
      ? null
      : addressViolation("replyToAddress", identity.replyToAddress),
  ]);
}

/** Le domaine d'une adresse, en minuscules (`no-reply@LFD.fr` → `lfd.fr`). */
export function senderDomainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

/** L'en-tête `From:` d'une identité : `"Nom" <adresse>`. */
export function senderHeaderOf(identity: MailSenderIdentity): string {
  return `"${identity.senderName.trim()}" <${identity.fromAddress}>`;
}

/**
 * **Les natures d'e-mail dont chaque espace règle l'identité d'envoi** (plan
 * `plan-desinscription-des-e-mails.md`, règle 9, lot U5) : `lfc` règle une
 * identité transactionnelle et une identité marketing ; `lfd`, l'espace de
 * l'équipe, n'envoie jamais de marketing (règle 19, 2026-11-08 — son origine
 * publique est nulle) et ne règle que la transactionnelle. Une table par
 * espace : un espace de plus ne compile pas sans sa ligne.
 */
export const MAIL_SENDER_NATURES: Readonly<Record<MailSpace, readonly MailNature[]>> = {
  lfc: ["transactional", "marketing"],
  lfd: ["transactional"],
};

/** L'espace règle-t-il une identité d'envoi pour cette nature ? */
export function hasSenderNature(space: MailSpace, nature: MailNature): boolean {
  return MAIL_SENDER_NATURES[space].includes(nature);
}

/**
 * D'où part un e-mail tant que son identité n'est pas réglée : la
 * configuration de l'API (`configuration`), ou — pour une identité marketing
 * pas encore réglée — l'identité transactionnelle de l'espace
 * (`transactional`).
 */
export type MailSenderFallbackSource = "configuration" | "transactional";

/**
 * L'identité par défaut, celle de la configuration de l'API
 * (`MAILER_FROM_ADDRESS`, `MAILER_REPLY_TO`) : celle d'un espace qui n'en a
 * pas. `fromAddress` est la valeur configurée telle quelle — elle peut déjà
 * porter un nom.
 */
export interface MailSenderDefaultView {
  readonly fromAddress: string;
  readonly replyToAddress: string | null;
  /**
   * D'où vient ce repli (U5) : la configuration, ou l'identité
   * transactionnelle de l'espace pour une identité marketing pas encore
   * réglée — `fromAddress` porte alors son en-tête `"Nom" <adresse>`.
   */
  readonly source: MailSenderFallbackSource;
}

/**
 * `GET /admin/mail-senders/:space/:nature` — rien n'est écrit, Resend est lu
 * (`/:space` seul : la nature `transactional`).
 *
 * `identity` : celle de l'espace, `null` s'il n'en a pas — il envoie alors
 * sous `fallback`. `verifiedDomains` : les domaines vérifiés chez Resend, pour
 * guider la saisie ; `null` quand la liste n'a pas pu être lue (pas de clé,
 * Resend injoignable) — l'enregistrement le dira à son tour.
 */
export interface MailSenderView {
  readonly space: MailSpace;
  /** La nature des e-mails que cette identité signe (U5). */
  readonly nature: MailNature;
  readonly identity: MailSenderIdentity | null;
  readonly fallback: MailSenderDefaultView;
  /** La révision lue (0 : jamais réglée) — le verrou de l'enregistrement. */
  readonly revision: number;
  readonly changed: MailEditorStamp | null;
  readonly verifiedDomains: readonly string[] | null;
}

/**
 * `PUT /admin/mail-senders/:space/:nature` (`/:space` seul : `transactional` ; en-tête `Idempotency-Key` obligatoire) —
 * 204 : un essai est parti vers l'auteur sous l'identité, puis elle a été
 * enregistrée ; l'écran relit. 400 forme, 409 domaine non vérifié, essai
 * refusé par Resend ou révision dépassée — rien n'est enregistré.
 */
export interface MailSenderPayload {
  readonly identity: MailSenderIdentity;
  readonly expectedRevision: number;
}

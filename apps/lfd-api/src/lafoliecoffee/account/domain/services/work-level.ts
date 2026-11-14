/**
 * **Le niveau de travail** d'une fiche, pour le suivi commercial : ce qu'elle
 * CONTIENT, jamais ce qu'on déclare (`documentation/b2b/plan-suivi-commercial.md`,
 * § 1 et § 3.2).
 *
 * Le niveau est le PLUS HAUT dont la condition propre est tenue — pas une
 * marche : un client actif sans contact noté est « active », et le contact
 * manquant reste dans `missing` plutôt que d'écraser le niveau.
 */
export const WORK_LEVELS = ["directory", "contacted", "qualified", "opened", "active"] as const;
export type WorkLevel = (typeof WORK_LEVELS)[number];

/**
 * Un manque, un mot. `missing` porte tout ce qui manque aux niveaux d'en
 * dessous du niveau atteint ET au niveau suivant.
 */
export type WorkGap =
  | "interlocutor"
  | "noted_contact"
  | "billing_address"
  | "delivery_address"
  | "holder_login"
  | "activation"
  | "first_order";

/**
 * Ce que le calcul lit d'une fiche — des faits déjà réduits, pas la fiche.
 * Les vides sont des chaînes vides, jamais `null` (`contactEmail` ne l'est pas).
 */
export interface WorkLevelInput {
  /** L'interlocuteur de la fiche : son nom, et de quoi le joindre. */
  readonly interlocutor: {
    readonly name: string;
    readonly email: string;
    readonly phone: string;
  };
  /** Les contacts notés (`company.contacted`) et rendez-vous honorés. */
  readonly notedContacts: number;
  readonly hasBillingAddress: boolean;
  /** Les adresses de livraison vivantes du carnet. */
  readonly deliveryAddressCount: number;
  /**
   * Aucune adresse de livraison n'est due : retrait seul (préférence
   * d'acheminement `pickup`) ou compte de groupe sans livraison.
   */
  readonly noDeliveryAddressNeeded: boolean;
  /** Le détenteur s'est connecté au moins une fois (`users.first_login_at`). */
  readonly holderLoggedIn: boolean;
  /** La société a été activée (`activated_at` posé). */
  readonly activated: boolean;
  readonly hasOrder: boolean;
}

export interface WorkLevelReading {
  readonly level: WorkLevel;
  /** Vide au dernier niveau : il n'y a plus de marche. */
  readonly missing: readonly WorkGap[];
}

/** Les manques de chaque niveau au-dessus de « directory », dans l'ordre. */
const LEVEL_GAPS: readonly ((input: WorkLevelInput) => readonly WorkGap[])[] = [
  contactedGaps,
  qualifiedGaps,
  openedGaps,
  activeGaps,
];

/** Le niveau d'une fiche, et ce qui manque en dessous et pour le suivant. Pur. */
export function workLevelOf(input: WorkLevelInput): WorkLevelReading {
  const gaps = LEVEL_GAPS.map((gapsOf) => gapsOf(input));
  const held = gaps.map((own) => own.length === 0);
  const reached = held.lastIndexOf(true) + 1;
  // Les niveaux 1..reached-1 non tenus, plus le suivant (s'il existe).
  const missing = gaps.slice(0, reached + 1).flat();
  return { level: WORK_LEVELS[reached] ?? "directory", missing };
}

function contactedGaps(input: WorkLevelInput): readonly WorkGap[] {
  const gaps: WorkGap[] = [];
  if (!hasInterlocutor(input.interlocutor)) {
    gaps.push("interlocutor");
  }
  if (input.notedContacts < 1) {
    gaps.push("noted_contact");
  }
  return gaps;
}

/** Un interlocuteur réel : un nom, ET un e-mail ou un téléphone. */
function hasInterlocutor(person: WorkLevelInput["interlocutor"]): boolean {
  const filled = (value: string): boolean => value.trim() !== "";
  return filled(person.name) && (filled(person.email) || filled(person.phone));
}

function qualifiedGaps(input: WorkLevelInput): readonly WorkGap[] {
  const gaps: WorkGap[] = [];
  if (!input.hasBillingAddress) {
    gaps.push("billing_address");
  }
  if (!input.noDeliveryAddressNeeded && input.deliveryAddressCount < 1) {
    gaps.push("delivery_address");
  }
  return gaps;
}

function openedGaps(input: WorkLevelInput): readonly WorkGap[] {
  return input.holderLoggedIn ? [] : ["holder_login"];
}

function activeGaps(input: WorkLevelInput): readonly WorkGap[] {
  const gaps: WorkGap[] = [];
  if (!input.activated) {
    gaps.push("activation");
  }
  if (!input.hasOrder) {
    gaps.push("first_order");
  }
  return gaps;
}

import type { B2bMails } from "../../mail-templates.js";
import { specimenDataOf } from "../mail-specimens.js";
import {
  SPECIMEN_CASE_ID,
  type MailCaseAxis,
  type MailCaseTable,
  type MailSpecimenCase,
} from "./mail-specimen-case.types.js";

/** Une donnée facultative est-elle là ? Une chaîne d'espaces ne compte pas. */
export const PRESENCE = ["present", "absent"] as const;

export function presence(value: string | null | undefined): (typeof PRESENCE)[number] {
  return value === null || value === undefined || value.trim() === "" ? "absent" : "present";
}

/** Un oui / non lu sur les données. */
export const YES_NO = ["yes", "no"] as const;

export function yesNo(value: boolean | undefined): (typeof YES_NO)[number] {
  return value === true ? "yes" : "no";
}

/** Le premier cas d'un e-mail : son exemple, tel que S4c le servait. */
export function specimenCase<K extends keyof B2bMails>(
  mail: K,
  label: string,
): MailSpecimenCase<K> {
  return { id: SPECIMEN_CASE_ID, label, data: (locale) => specimenDataOf(mail, locale) };
}

/** Un autre cas : l'exemple de l'e-mail, une donnée changée. */
export function variantCase<K extends keyof B2bMails>(
  mail: K,
  id: string,
  label: string,
  change: (specimen: B2bMails[K]) => B2bMails[K],
): MailSpecimenCase<K> {
  return { id, label, data: (locale) => change(specimenDataOf(mail, locale)) };
}

/** Un e-mail dont les phrases ne dépendent d'aucune donnée : son exemple seul, sans axe. */
export function specimenOnly<K extends keyof B2bMails>(mail: K): MailCaseTable<K> {
  return { cases: [specimenCase(mail, "Exemple")], axes: [] };
}

/**
 * Un e-mail qui salue par le prénom quand il le connaît (« Bonjour Jeanne, »
 * ou « Bonjour, ») : l'exemple, et le même sans prénom.
 */
export function greetingTable<K extends keyof B2bMails>(
  mail: K,
  firstNameOf: (data: B2bMails[K]) => string,
  withoutFirstName: (data: B2bMails[K]) => B2bMails[K],
): MailCaseTable<K> {
  const axis: MailCaseAxis<K> = {
    id: "firstName",
    values: PRESENCE,
    of: (data) => presence(firstNameOf(data)),
  };
  return {
    cases: [
      specimenCase(mail, "Avec un prénom"),
      variantCase(mail, "anonymous", "Sans prénom", withoutFirstName),
    ],
    axes: [axis],
  };
}

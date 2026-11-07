import type { ContentLocale } from "@lfd/contracts";

import type { B2bMails } from "../../mail-templates.js";
import { CUSTOMER_CASE_TABLES } from "./customer-specimen-cases.js";
import type {
  MailCaseTable,
  MailCaseTables,
  MailSpecimenCase,
} from "./mail-specimen-case.types.js";
import { ORDER_ANSWER_CASE_TABLES } from "./order-answer-specimen-cases.js";
import { ORDER_CASE_TABLES } from "./order-specimen-cases.js";
import { TEAM_CASE_TABLES } from "./team-specimen-cases.js";

/**
 * **Les cas de chaque e-mail** (plan `plan-editeur-par-blocs.md`, § 16, lot
 * S4d) : un jeu de données d'exemple par cas, servi en production — la liste
 * que l'éditeur montre, et ce que l'aperçu fidèle rend. Chaque axe qui fait
 * changer les phrases d'un e-mail a un cas qui l'exerce (le test le tient).
 *
 * 🔴 Les empreintes de rendu (`__tests__/rendering-golden/`) gardent leurs
 * propres jeux : leurs données ne sont pas marquées `EXEMPLE`, et les
 * remplacer par ceux-ci changerait chaque empreinte (vérifié le 2026-11-07).
 */
export const MAIL_CASE_TABLES: MailCaseTables = {
  ...ORDER_CASE_TABLES,
  ...ORDER_ANSWER_CASE_TABLES,
  ...CUSTOMER_CASE_TABLES,
  ...TEAM_CASE_TABLES,
};

/** La table des cas d'un e-mail. */
export function mailCaseTableOf<K extends keyof B2bMails>(mail: K): MailCaseTable<K> {
  const table: MailCaseTables[K] = MAIL_CASE_TABLES[mail];
  return table;
}

/** Les cas d'un e-mail, tels que la liste les montre : identifiant et libellé. */
export function mailCasesOf(
  mail: keyof B2bMails,
): readonly { readonly id: string; readonly label: string }[] {
  return mailCaseTableOf(mail).cases.map(({ id, label }) => ({ id, label }));
}

/** Les données d'un cas, dans une langue — `null` : l'e-mail n'a pas ce cas. */
export function mailCaseDataOf<K extends keyof B2bMails>(
  mail: K,
  caseId: string,
  locale: ContentLocale,
): B2bMails[K] | null {
  const found: MailSpecimenCase<K> | undefined = mailCaseTableOf(mail).cases.find(
    (candidate) => candidate.id === caseId,
  );
  return found === undefined ? null : found.data(locale);
}

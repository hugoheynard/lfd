import type { LayoutSectionId } from "@lfd/mailer";

import type { B2bMails } from "../mail-templates.js";
import { CUSTOMER_MAIL_LAYOUTS } from "./customer-mail-layouts.js";
import {
  SECTION_LABELS,
  SECTION_NATURES,
  type MailLayoutDeclaration,
  type MailLayouts,
  type MailSectionNature,
  type MailSectionText,
} from "./mail-layout.types.js";
import { ORDER_CHANGE_MAIL_LAYOUTS } from "./order-change-mail-layouts.js";
import { ORDER_MAIL_LAYOUTS } from "./order-mail-layouts.js";
import { ORDER_SHORTFALL_MAIL_LAYOUTS } from "./order-shortfall-mail-layouts.js";
import { TEAM_MAIL_LAYOUTS } from "./team-mail-layouts.js";

export type {
  MailLayoutDeclaration,
  MailSectionNature,
  MailSectionText,
} from "./mail-layout.types.js";

/**
 * **Les sections de chaque e-mail du registre** (plan
 * `plan-textes-des-e-mails.md`, E4) — exhaustif : un e-mail ajouté au
 * registre sans sa déclaration ne compile pas.
 */
export const MAIL_LAYOUTS: MailLayouts = {
  ...ORDER_MAIL_LAYOUTS,
  ...CUSTOMER_MAIL_LAYOUTS,
  ...TEAM_MAIL_LAYOUTS,
  ...ORDER_CHANGE_MAIL_LAYOUTS,
  ...ORDER_SHORTFALL_MAIL_LAYOUTS,
};

/** Une section d'un e-mail, résolue : libellé et nature posés. */
export interface ResolvedMailSection {
  readonly id: LayoutSectionId;
  readonly label: string;
  readonly nature: MailSectionNature;
  readonly texts: readonly MailSectionText[];
}

/** Un e-mail, ses cadres et ses sections dans l'ordre par défaut. */
export interface ResolvedMailLayout {
  readonly mail: string;
  readonly subject: readonly MailSectionText[];
  readonly header: readonly MailSectionText[];
  readonly sections: readonly ResolvedMailSection[];
}

function resolve(mail: string, declaration: MailLayoutDeclaration): ResolvedMailLayout {
  return {
    mail,
    subject: declaration.subject,
    header: declaration.header,
    sections: declaration.sections.map((section) => ({
      id: section.id,
      label: section.label ?? SECTION_LABELS[section.id],
      nature: section.nature ?? SECTION_NATURES[section.id],
      texts: section.texts,
    })),
  };
}

/** Les déclarations, résolues, dans l'ordre des clés du registre. */
export function mailLayouts(): readonly ResolvedMailLayout[] {
  return (Object.keys(MAIL_LAYOUTS) as (keyof B2bMails)[]).map((mail) =>
    resolve(mail, MAIL_LAYOUTS[mail]),
  );
}

import type { B2bMails } from "../../mail-templates.js";

/** Les cas d'un e-mail : un nom lisible → les données passées au gabarit. */
export type MailCases = { readonly [K in keyof B2bMails]: Readonly<Record<string, B2bMails[K]>> };

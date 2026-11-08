import type { MailLocale } from "@lfd/mail-blocks";

/**
 * « Mes préférences » : la case « partenaires » — les offres des autres
 * sociétés du groupe (plan de désinscription, règles 14, 19, 20). Bâtie,
 * éteinte tant que le groupe n'a pas deux sociétés marketing.
 */
export class AcceptMarketingPartnersCommand {
  constructor(
    readonly userId: string,
    readonly address: string,
    readonly addressProven: boolean,
    readonly textVersion: string,
    readonly locale: MailLocale,
  ) {}
}

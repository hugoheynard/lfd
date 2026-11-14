import type { CompanyContactMode, SalesOversightTodayView } from "@lfd/contracts";

import type { SubjectMail } from "../../../../mail/channels/deliveries/mail-subject-deliveries.js";
import type { SalesSheet } from "../../domain/sales-oversight.js";
import { contactsByMode, countOn, levelUpsOn, type ParisDay } from "../../domain/sales-today.js";
import { ACCESS_OPENED_TEMPLATE } from "./sales-oversight-view.js";

/** Ce que le récap du jour assemble, lu par ailleurs. */
export interface SalesTodayInput {
  readonly day: ParisDay;
  readonly opened: number;
  readonly contacts: readonly CompanyContactMode[];
  /** Les fiches suivies du filtre, AVANT les filtres de niveau et de signal. */
  readonly sheets: readonly SalesSheet[];
  /** Les e-mails de ces fiches, tels que la lecture du tableau les a déjà reçus. */
  readonly mails: ReadonlyMap<string, readonly SubjectMail[]>;
}

/** Le récap du jour : aucune lecture de plus, tout vient de l'entrée. */
export function todayViewOf(input: SalesTodayInput): SalesOversightTodayView {
  const requested = input.sheets.flatMap((sheet) =>
    (input.mails.get(sheet.facts.companyId) ?? [])
      .filter((mail) => mail.template === ACCESS_OPENED_TEMPLATE)
      .map((mail) => mail.requestedAt),
  );
  return {
    day: input.day.day,
    opened: input.opened,
    levelUps: levelUpsOn(input.sheets, input.day),
    accessResent: countOn(requested, input.day),
    contacts: contactsByMode(input.contacts),
  };
}

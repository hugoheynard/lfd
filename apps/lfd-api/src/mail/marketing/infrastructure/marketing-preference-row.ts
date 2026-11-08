import { MailBrand } from "../../requests/domain/value-objects/mail-brand.js";
import {
  MarketingPreference,
  type MarketingPreferenceSnapshot,
} from "../domain/entities/marketing-preference.js";
import { InvalidMarketingPreferenceError } from "../domain/errors/marketing-preference.errors.js";
import {
  CONSENT_ORIGINS,
  CONSENT_PLACES,
  MARKETING_STATUSES,
  oneOf,
  UNSUBSCRIBE_SOURCES,
} from "../domain/value-objects/marketing-vocabulary.js";

/** La ligne telle que Prisma la rend — confinée à `infrastructure/`. */
export interface MarketingPreferenceRow {
  readonly id: string;
  readonly space: string;
  readonly recipientKey: string | null;
  readonly print: string;
  readonly status: string;
  readonly origin: string | null;
  readonly acceptedTextVersion: string | null;
  readonly acceptedLocale: string | null;
  readonly acceptedWhere: string | null;
  readonly acceptedRef: string | null;
  readonly requestedAt: Date | null;
  readonly confirmedAt: Date | null;
  readonly unsubscribedAt: Date | null;
  readonly unsubscribedSource: string | null;
}

/** Une valeur d'une liste fermée ; une valeur inconnue est un schéma en avance sur ce binaire. */
function closed<T extends string>(list: readonly T[], raw: string, field: string): T {
  const value = oneOf(list, raw);
  if (value === null) {
    throw new InvalidMarketingPreferenceError(field, `vaut « ${raw} », inconnu de ce binaire`);
  }
  return value;
}

function optional<T extends string>(
  list: readonly T[],
  raw: string | null,
  field: string,
): T | null {
  return raw === null ? null : closed(list, raw, field);
}

function proofOf(row: MarketingPreferenceRow): MarketingPreferenceSnapshot["proof"] {
  if (
    row.acceptedTextVersion === null ||
    row.acceptedLocale === null ||
    row.acceptedWhere === null
  ) {
    return null;
  }
  return {
    textVersion: row.acceptedTextVersion,
    locale: row.acceptedLocale,
    place: closed(CONSENT_PLACES, row.acceptedWhere, "le lieu de l'accord"),
    ref: row.acceptedRef,
  };
}

export function toDomain(row: MarketingPreferenceRow): MarketingPreference {
  return MarketingPreference.rehydrate({
    id: row.id,
    space: MailBrand.of(row.space).code,
    recipientKey: row.recipientKey,
    print: row.print,
    status: closed(MARKETING_STATUSES, row.status, "l'état"),
    origin: optional(CONSENT_ORIGINS, row.origin, "l'origine"),
    proof: proofOf(row),
    requestedAt: row.requestedAt,
    confirmedAt: row.confirmedAt,
    unsubscribedAt: row.unsubscribedAt,
    unsubscribedSource: optional(UNSUBSCRIBE_SOURCES, row.unsubscribedSource, "la source"),
  });
}

export function toPersistence(preference: MarketingPreference): MarketingPreferenceRow {
  const state = preference.snapshot();
  return {
    id: state.id,
    space: state.space,
    recipientKey: state.recipientKey,
    print: state.print,
    status: state.status,
    origin: state.origin,
    acceptedTextVersion: state.proof?.textVersion ?? null,
    acceptedLocale: state.proof?.locale ?? null,
    acceptedWhere: state.proof?.place ?? null,
    acceptedRef: state.proof?.ref ?? null,
    requestedAt: state.requestedAt,
    confirmedAt: state.confirmedAt,
    unsubscribedAt: state.unsubscribedAt,
    unsubscribedSource: state.unsubscribedSource,
  };
}

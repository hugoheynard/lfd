import type { PromotionAudienceTargetView } from '@lfd/contracts';

import { businessDayStart } from '../shared/business-day';
import { decimalOf, EFFECT_FACTOR, type PromotionDraft } from './promotion-draft';
import { effectPhrase } from './promotion-format';

/**
 * **La promotion en une phrase**, pendant la saisie : « −20 % pour les pros
 * et les particuliers inscrits, sur tout sauf Chocolaterie, au retrait, dès
 * le 1 novembre 2026 ». Pure : elle lit le brouillon et les noms connus, et
 * dit « à préciser » plutôt que d'inventer ce qui n'est pas encore saisi.
 */
export function draftSummary(
  draft: PromotionDraft,
  names: ReadonlyMap<string, string>,
  pickupNames: ReadonlyMap<string, string>,
  zoneNames: ReadonlyMap<string, string> = new Map(),
): string {
  return [
    `${effectPart(draft)} pour ${audiencePart(draft.audiences)}`,
    scopePart(draft, names),
    fulfillmentPart(draft, pickupNames, zoneNames),
    windowPart(draft),
  ].join(', ');
}

function effectPart(draft: PromotionDraft): string {
  const value = decimalOf(draft.effectValue);
  if (value === null) {
    return 'Une remise à préciser';
  }
  return effectPhrase({
    kind: draft.effectKind,
    value: Math.round(value * EFFECT_FACTOR[draft.effectKind]),
  });
}

const AUDIENCE_WORDS: Readonly<Record<PromotionAudienceTargetView['kind'], string>> = {
  everyone: 'tout le monde',
  individuals: 'les particuliers',
  individuals_guest: 'les particuliers invités',
  individuals_registered: 'les particuliers inscrits',
  pros: 'les pros',
  pros_active: 'les pros actifs',
  pros_pending: "les pros en cours d'inscription",
  company: 'la société',
  company_and_sites: 'la société',
  everyone_but_active_pros: 'tous sauf les pros actifs',
};

function audiencePart(audiences: readonly PromotionAudienceTargetView[]): string {
  if (audiences.length === 0) {
    return 'un public à choisir';
  }
  return listed(
    audiences.map((target) => {
      const words = AUDIENCE_WORDS[target.kind];
      const company = target.companyId?.trim() || '…';
      if (target.kind === 'company') {
        return `${words} ${company}`;
      }
      return target.kind === 'company_and_sites' ? `${words} ${company} et ses sites` : words;
    }),
  );
}

/** Au-delà, la phrase cesse d'être lue : on compte le reste. */
const NAMED_AT_MOST = 3;

function scopePart(draft: PromotionDraft, names: ReadonlyMap<string, string>): string {
  const named = (eligible: boolean) =>
    draft.rules
      .filter((rule) => rule.eligible === eligible)
      .map((rule) => names.get(rule.targetId) ?? rule.targetId);
  const excluded = named(false);
  const except = excluded.length === 0 ? '' : ` sauf ${shortList(excluded)}`;
  if (draft.scopeMode === 'all_except') {
    return excluded.length === 0 ? 'sur tout le catalogue' : `sur tout${except}`;
  }
  const included = named(true);
  return included.length === 0
    ? 'sur une sélection encore vide'
    : `seulement sur ${shortList(included)}${except}`;
}

/**
 * L'ensemble, en mots : « au retrait à L'adroit et en livraison dans la zone
 * Centre ». Une sélection se nomme entière — un point oublié dans la phrase
 * serait un point qu'on croit hors de la promotion.
 */
function fulfillmentPart(
  draft: PromotionDraft,
  pickupNames: ReadonlyMap<string, string>,
  zoneNames: ReadonlyMap<string, string>,
): string {
  if (draft.fulfillmentKind === 'displayed_price') {
    return "dans le prix affiché, quel que soit l'acheminement";
  }
  const parts: string[] = [];
  const { pickup, delivery } = draft;
  if (pickup.on) {
    const points = pickup.ids.map((id) => pickupNames.get(id) ?? id);
    parts.push(
      pickup.all
        ? 'au retrait'
        : points.length === 0
          ? 'au retrait à un point à choisir'
          : `au retrait à ${listed(points)}`,
    );
  }
  if (delivery.on) {
    const zones = delivery.ids.map((id) => zoneNames.get(id) ?? id);
    parts.push(
      delivery.all
        ? 'en livraison'
        : zones.length === 0
          ? 'en livraison dans une zone à choisir'
          : `en livraison dans ${zones.length === 1 ? 'la zone' : 'les zones'} ${listed(zones)}`,
    );
  }
  return parts.length === 0 ? 'à un acheminement à choisir' : parts.join(' et ');
}

const DAY = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/** La borne de fin est exclue : le dernier jour couvert est sa veille. */
const LAST_COVERED_MS = 1;

function windowPart(draft: PromotionDraft): string {
  const from = businessDayStart(draft.validFrom);
  if (from === null) {
    return 'à une date à choisir';
  }
  const to = draft.validTo === '' ? null : businessDayStart(draft.validTo);
  if (to === null) {
    return `dès le ${DAY.format(new Date(from))}`;
  }
  const last = new Date(new Date(to).getTime() - LAST_COVERED_MS);
  return `du ${DAY.format(new Date(from))} au ${DAY.format(last)}`;
}

function shortList(items: readonly string[]): string {
  if (items.length <= NAMED_AT_MOST) {
    return listed(items);
  }
  const rest = items.length - NAMED_AT_MOST;
  return `${items.slice(0, NAMED_AT_MOST).join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`;
}

function listed(items: readonly string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} et ${items[items.length - 1]}`;
}

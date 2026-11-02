import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import { instantToLocal, type OrderSaleUnit, type ResupplyTarget } from '@lfd/contracts';

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * « mercredi 9 septembre » pour `2026-09-09`. Une journée nue n'a pas de
 * fuseau : elle se lit en UTC, pour que le poste ne la décale pas.
 */
export function resupplyDayLabel(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

/** « 18:00 » : l'heure de Paris d'un instant ISO, celle du four. */
export function parisClock(iso: string): string {
  return instantToLocal(new Date(iso)).time;
}

/** Le nom d'une visée, tel que le comptoir l'a choisi. */
export const RESUPPLY_TARGET_LABELS: Readonly<Record<ResupplyTarget, string>> = {
  tomorrow: 'Pour demain',
  asap: 'Au plus tôt',
};

/**
 * La marque d'un réassort envoyé par le fournil, à part de la demande du
 * comptoir (lot R1d) — la même sur l'écran du fournil et à la réception.
 */
export const BAKEHOUSE_ORIGIN_MARK = 'Envoyé par le fournil';

/**
 * La marque d'une sortie de réserve (plan A1, lot A1.4) : le pain rendu par
 * une annulation, envoyé depuis le colisage — il se réceptionne comme les
 * autres.
 */
export const RESERVE_ORIGIN_MARK = 'Pain rendu, envoyé par la réserve';

/**
 * Le titre d'un réassort nommé (R1g, Hugo 2026-10-21) : « Vitrine du matin —
 * Village ». Sans nom, `unnamed` — l'affichage de l'endroit tel qu'avant le
 * nom. Même forme que `resupplyTitleOf` de `@lfd/contracts`, recopiée ici
 * pour ne pas faire dépendre l'écran d'un export neuf du paquet, que le
 * pré-bundle du serveur de dev ne verrait pas.
 */
export function resupplyTitle(name: string | null, siteLabel: string, unnamed: string): string {
  return name === null ? unnamed : `${name} — ${siteLabel}`;
}

/**
 * Ce qu'un réassort envoie, en un mot : « 12 pièces », « 1,25 kg », ou
 * « 12 pièces · 1,25 kg » (lot L2b-4 de `limites-de-commande/plan-jour-meme-sur-stock.md`).
 * Les pièces ne comptent que les pièces ; le poids se dit à part, jamais en somme.
 */
export function resupplyAmountLabel(pieces: number, weightGrams: number): string {
  const counted = `${String(pieces)} pièces`;
  if (weightGrams <= 0) {
    return counted;
  }
  const weight = saleQuantityLabel(weightGrams, 'weight');
  return pieces > 0 ? `${counted} · ${weight}` : weight;
}

/** La même chose, à partir des lignes d'un réassort, chacune dans son unité. */
export function resupplyLinesAmountLabel(
  lines: readonly { readonly quantity: number; readonly saleUnit: OrderSaleUnit }[],
): string {
  let pieces = 0;
  let weightGrams = 0;
  for (const line of lines) {
    if (line.saleUnit === 'weight') {
      weightGrams += line.quantity;
    } else {
      pieces += line.quantity;
    }
  }
  return resupplyAmountLabel(pieces, weightGrams);
}

import type { ClientSheet, SheetMoney } from "@lfd/contracts";

import { sheetShowsTtc } from "./order-sheet.js";
import { money } from "./order-sheet-pdf-format.js";

/**
 * **Le pavé de totaux du bon de commande**, ligne par ligne — sans dessin.
 *
 * Sorti de `order-sheet-pdf.ts` le 2026-10-09 : le bon public y a ajouté son
 * propre pied, et l'ordre des lignes est une règle qu'on éprouve mieux à part
 * de la plume.
 */

/** Une ligne du pavé de totaux. */
export interface TotalRow {
  readonly label: string;
  readonly value: string;
  readonly rule?: boolean;
  readonly strong?: boolean;
}

/**
 * La mention d'un bon au compte, sous son total HT : elle dit OÙ le client
 * trouvera ce que le bon ne chiffre plus (F5).
 */
export const PRETAX_ONLY_NOTE = "TVA et TTC sur la facture du mois.";

/**
 * Les gestes entre les articles et le total — remise, bon, livraison,
 * surtaxe —, chacun seulement s'il a eu lieu. Communs aux deux bons.
 */
function adjustmentRows(totals: SheetMoney): readonly TotalRow[] {
  return [
    ...(totals.discountCents === 0
      ? []
      : [{ label: "Remise", value: money(-totals.discountCents) }]),
    // Le bon de fidélité, après la remise et sur sa propre ligne (plan des points, C7).
    ...(totals.voucherDiscountCents === 0
      ? []
      : [{ label: "Bon de fidélité", value: money(-totals.voucherDiscountCents) }]),
    ...(totals.deliveryFeeCents === 0
      ? []
      : [{ label: "Livraison", value: money(totals.deliveryFeeCents) }]),
    // La surtaxe s'ajoute APRÈS la remise : on ne fait pas de geste commercial
    // sur une pénalité de retard.
    ...(totals.lateFeeCents === 0
      ? []
      : [{ label: "Surtaxe de commande tardive", value: money(totals.lateFeeCents) }]),
  ];
}

/**
 * La TVA par taux, figée sur la commande. `null` = commande antérieure au gel :
 * on dit le total, ce qui est vrai, plutôt qu'un détail reconstitué qui pourrait
 * ne pas être celui qu'on a facturé.
 */
function vatRows(totals: SheetMoney): readonly TotalRow[] {
  return totals.vatShares === null
    ? [{ label: "dont TVA", value: money(totals.vatCents) }]
    : totals.vatShares.map((share) => ({
        label: `dont TVA ${String(share.rate).replace(".", ",")} %`,
        value: money(share.amountCents),
      }));
}

/**
 * **Le pied d'un pro au compte : le HT, et rien d'autre** (plan
 * `bons-et-facture-concordants`, F5). La TVA se calcule une fois sur le mois :
 * un TTC par bon différerait de quelques centimes de la facture, et une
 * différence ressemble à une erreur. Aucun chiffre de TVA ni de TTC ici.
 */
function pretaxTail(pretaxCents: number): readonly TotalRow[] {
  return [{ label: "Total HT", value: money(pretaxCents), rule: true, strong: true }];
}

/** Le pied d'une commande pro réglée à la commande (carte, gratuite) : inchangé. */
function taxedTail(totals: SheetMoney, pretaxCents: number): readonly TotalRow[] {
  return [
    { label: "Total avant TVA", value: money(pretaxCents), rule: true },
    ...vatRows(totals),
    { label: "Total TTC", value: money(totals.totalCents), rule: true, strong: true },
  ];
}

/** Le pied du bon pro, dans l'ordre où la référence le pose. */
function proRows(totals: SheetMoney): readonly TotalRow[] {
  const net = Math.max(
    0,
    totals.subtotalCents - totals.discountCents - totals.voucherDiscountCents,
  );
  const pretax = net + totals.deliveryFeeCents + totals.lateFeeCents;
  return [
    // 🔴 **« HT » est écrit, il n'est plus sous-entendu.** La colonne des
    // articles peut être en TTC ; un pied qui dirait « Sous-total » au-dessous
    // inviterait à une addition qui ne tombe pas — et l'écart n'est pas un
    // arrondi, c'est la TVA entière (R3, 2026-09-21).
    { label: "Sous-total HT", value: money(totals.subtotalCents) },
    ...adjustmentRows(totals),
    ...(totals.settlement === "account" ? pretaxTail(pretax) : taxedTail(totals, pretax)),
  ];
}

/**
 * Le montant des articles tel que la colonne le montre : la somme des totaux
 * de ligne TTC scellés, ou le sous-total HT figé quand la feuille n'en porte
 * pas (commande antérieure à R3 — le tableau est alors en HT aussi).
 */
function articlesCents(sheet: ClientSheet): number {
  if (!sheetShowsTtc(sheet)) {
    return sheet.money.subtotalCents;
  }
  return sheet.lines.reduce((sum, line) => sum + (line.lineTotalTtcCents ?? 0), 0);
}

/** Un geste du pied public : son libellé, et son montant HT figé, signé. */
interface Gesture {
  readonly label: string;
  readonly pretaxCents: number;
}

/** Les gestes qui ont eu lieu, signés comme ils pèsent sur le total. */
function gesturesOf(totals: SheetMoney): readonly Gesture[] {
  return [
    { label: "Remise", pretaxCents: -totals.discountCents },
    { label: "Bon de fidélité", pretaxCents: -totals.voucherDiscountCents },
    { label: "Livraison", pretaxCents: totals.deliveryFeeCents },
    { label: "Surtaxe de commande tardive", pretaxCents: totals.lateFeeCents },
  ].filter((gesture) => gesture.pretaxCents !== 0);
}

/**
 * Les gestes **en TTC** (Hugo, 2026-10-09 : « en TTC recalculé »).
 *
 * La commande fige ses gestes HORS taxe et ne fige pas leur part de TVA par
 * taux (`SheetMoney`, vérifié le 2026-10-09). Ce qu'elle fige, en revanche, ce
 * sont les deux bouts : le total TTC, et chaque ligne TTC. L'écart entre les
 * deux EST la somme TTC des gestes — c'est lui qu'on répartit, au prorata de
 * leur montant HT, le dernier prenant le reste au centime. La colonne retombe
 * donc exactement sur le Total TTC, sans qu'aucun taux ne soit deviné.
 *
 * Gestes qui s'annulent en HT (somme nulle) : aucune clé de répartition
 * honnête n'existe, ils restent en HT et le disent.
 */
function taxedGestureRows(sheet: ClientSheet): readonly TotalRow[] {
  const gestures = gesturesOf(sheet.money);
  const pretaxSum = gestures.reduce((sum, gesture) => sum + gesture.pretaxCents, 0);
  if (gestures.length === 0) {
    return [];
  }
  if (pretaxSum === 0) {
    return gestures.map((gesture) => ({
      label: `${gesture.label} (HT)`,
      value: money(gesture.pretaxCents),
    }));
  }
  const residual = sheet.money.totalCents - articlesCents(sheet);
  let allotted = 0;
  return gestures.map((gesture, index) => {
    const last = index === gestures.length - 1;
    const taxed = last
      ? residual - allotted
      : Math.round((gesture.pretaxCents * residual) / pretaxSum);
    allotted += taxed;
    return { label: gesture.label, value: money(taxed) };
  });
}

/**
 * **Le pied du bon public** (plan `plan-bon-public.md`, §2.2) : les articles,
 * les gestes en TTC s'il y en a, le **Total TTC**, puis « dont TVA ». Ni
 * « Sous-total HT » ni « Total avant TVA » : un particulier lit un prix taxe
 * comprise, et la colonne s'additionne.
 */
function publicRows(sheet: ClientSheet): readonly TotalRow[] {
  const totals = sheet.money;
  return [
    { label: "Articles", value: money(articlesCents(sheet)) },
    ...taxedGestureRows(sheet),
    { label: "Total TTC", value: money(totals.totalCents), rule: true, strong: true },
    ...vatRows(totals),
  ];
}

/** Les lignes du pavé de totaux, selon le bon. */
export function totalRows(sheet: ClientSheet): readonly TotalRow[] {
  return sheet.variant === "public" ? publicRows(sheet) : proRows(sheet.money);
}

import { formatCents, formatMillicents } from '@lfd/b2b-ui/order';
import type { OrderRevisionQuoteView, OrderRevisionUnitPrice, OrderSaleUnit } from '@lfd/contracts';
import { weightLabel } from '@lfd/money';

/**
 * **Les refus d'un devis de révision, dits pour l'équipe** (plan
 * `documentation/promotions/plan-remises-acquises.md`, § 10.4) — une ligne
 * déjà commandée dont la quantité changerait le prix (les deux prix), un
 * article qui n'est plus vendu, une remise qui serait perdue. Le serveur
 * décide ; l'écran ne fait que dire, à côté de la ligne.
 */

/** Un prix unitaire dit : TTC pour un particulier, HT sinon ; au kilo pour une ligne au poids. */
export function unitPriceSaid(price: OrderRevisionUnitPrice, saleUnit: OrderSaleUnit): string {
  const amount =
    price.unitPriceTtcCents === null
      ? `${formatMillicents(price.unitPriceMillicents)} HT`
      : `${formatCents(price.unitPriceTtcCents)} TTC`;
  return saleUnit === 'weight' ? `${amount} le kg` : amount;
}

/** Les phrases de refus, par SKU ; une ligne sans refus n'a pas d'entrée. */
export function refusalsBySku(
  quote: OrderRevisionQuoteView,
): ReadonlyMap<string, readonly string[]> {
  const said = new Map<string, string[]>();
  const push = (sku: string, text: string): void => {
    said.set(sku, [...(said.get(sku) ?? []), text]);
  };
  const units = new Map(quote.lines.map((line) => [line.sku, line.saleUnit] as const));
  for (const line of quote.lines) {
    const refusal = line.refusal;
    if (refusal === null) {
      continue;
    }
    push(
      line.sku,
      refusal.kind === 'withdrawn'
        ? `« ${line.productName} » n’est plus vendu : sa quantité ne change plus — gardez la quantité commandée, ou annulez et passez une nouvelle commande.`
        : `Changer la quantité de « ${line.productName} » change son prix : ` +
            `${unitPriceSaid(refusal.frozen, line.saleUnit)} → ${unitPriceSaid(refusal.current, line.saleUnit)}` +
            ' — gardez la quantité commandée, ou annulez et passez une nouvelle commande.',
    );
  }
  for (const refusal of quote.discountRefusals) {
    const minimum =
      units.get(refusal.sku) === 'weight'
        ? weightLabel(refusal.minQuantity)
        : String(refusal.minQuantity);
    const name = refusal.label === null ? 'une remise' : `la remise « ${refusal.label.fr} »`;
    push(refusal.sku, `Cette modification ferait perdre ${name} (dès ${minimum}).`);
  }
  return said;
}

/** Le devis porte-t-il un refus ? Tant qu'il en porte un, rien ne s'applique. */
export function hasRefusal(quote: OrderRevisionQuoteView): boolean {
  return quote.discountRefusals.length > 0 || quote.lines.some((line) => line.refusal !== null);
}

/**
 * Doc `documentation/commandes/modification/modifier-une-commande.md`, §2.7.2 (Q3 a) :
 * l'équipe ne modifie pas une commande payée par carte — une hausse se paie
 * par le client, une baisse ou un total égal ne se font pas encore. La phrase
 * de la hausse reprend celle du serveur (`increase_by_staff`).
 */
export const STAFF_CARD_INCREASE_REFUSAL =
  "Cette commande est payée par carte : l'équipe ne peut pas l'augmenter. " +
  'Demandez au client de modifier sa commande, ou passez une seconde commande.';

const CARD_NOT_YET =
  "Cette commande est payée par carte : une baisse ou un changement à total égal n'est pas encore possible.";

const CARD_UNSETTLED =
  "Le paiement par carte de cette commande n'est pas encore encaissé : elle ne se modifie pas.";

/** Le règlement du devis qui empêche l'équipe de valider, dit ; `null` s'il se règle comme passé. */
export function settlementRefusalOf(quote: OrderRevisionQuoteView): string | null {
  const settlement = quote.settlement;
  switch (settlement.kind) {
    case 'as_placed':
      return null;
    case 'card_complement':
      return STAFF_CARD_INCREASE_REFUSAL;
    case 'card_not_revisable':
      switch (settlement.reason) {
        case 'increase_by_staff':
          return STAFF_CARD_INCREASE_REFUSAL;
        case 'unsettled':
          return CARD_UNSETTLED;
        case 'decrease':
        case 'same_total':
          return CARD_NOT_YET;
      }
  }
}

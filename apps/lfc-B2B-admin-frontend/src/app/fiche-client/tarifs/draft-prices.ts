import type { CompanyMercurialeLinePayload, CompanyPricingView } from '@lfd/contracts';

import { millicentsField, millicentsOf } from '../../commercial/tarification/grille/price-field';

/**
 * **La grille en cours de saisie** — un prix par article, en chaîne.
 *
 * En chaînes et non en nombres, pour la même raison que la grille d'un gabarit :
 * un champ qu'on vide doit pouvoir rester vide le temps qu'on tape le nombre
 * suivant. Convertir à chaque frappe remettrait « 0 » sous les doigts.
 *
 * ⚠️ **Un prix, pas des paliers.** La mercuriale qu'on établit sur la fiche d'un
 * compte est à prix fixe ; les grilles à paliers restent le domaine des
 * gabarits, et arriveront ici comme une forme de plus — pas comme un mode caché
 * de celle-ci.
 */
export type DraftPrices = ReadonlyMap<string, string>;

/** Ce qui est tapé pour cet article, ou la chaîne vide s'il n'est pas tarifé. */
export function priceOf(draft: DraftPrices, sku: string): string {
  return draft.get(sku) ?? '';
}

/** Le prix en millicentimes que le SERVEUR accepterait. `null` = rien de lisible. */
export function millicentsIn(draft: DraftPrices, sku: string): number | null {
  const raw = draft.get(sku);
  return raw === undefined ? null : millicentsOf(raw);
}

export function withPrice(draft: DraftPrices, sku: string, raw: string): DraftPrices {
  const next = new Map(draft);
  // Un champ vidé RETIRE l'article de la grille plutôt que d'y laisser une
  // entrée illisible : « pas de prix » et « prix qu'on n'a pas fini de taper »
  // ne doivent pas se ressembler au moment de poser.
  if (raw.trim() === '') {
    next.delete(sku);
    return next;
  }
  next.set(sku, raw);
  return next;
}

export function withoutPrice(draft: DraftPrices, sku: string): DraftPrices {
  const next = new Map(draft);
  next.delete(sku);
  return next;
}

/**
 * Les lignes prêtes à partir.
 *
 * Ce qui **tombe** : tout ce qui ne se lit pas comme un prix. Un champ à moitié
 * tapé (« 1, ») n'est pas une décision, et l'envoyer ferait refuser la grille
 * entière pour une ligne que personne ne regardait.
 */
export function toLines(draft: DraftPrices): readonly CompanyMercurialeLinePayload[] {
  return [...draft.entries()]
    .map(([sku, raw]) => ({ sku, unitPriceMillicents: millicentsOf(raw) }))
    .filter((line): line is CompanyMercurialeLinePayload => line.unitPriceMillicents !== null);
}

/**
 * **La grille pré-remplie avec ce que le client paie déjà.**
 *
 * Le prix scellé par sa mercuriale, et lui seul : un article au tarif catalogue
 * reste vide. Pré-remplir tout le catalogue avec son propre tarif ferait poser
 * quatre-vingt-douze règles qui ne décident rien, et rendrait indistinguable
 * « je lui accorde le tarif public » de « je n'ai rien accordé ».
 */
export function draftFromView(view: CompanyPricingView): DraftPrices {
  const draft = new Map<string, string>();
  for (const category of view.categories) {
    for (const item of category.items) {
      if (item.sealedByRuleId !== null) {
        draft.set(item.sku, millicentsField(item.finalMillicents));
      }
    }
  }
  return draft;
}

/**
 * **Le pont entre le champ (des euros, en nombre) et le brouillon (des
 * millicentimes, exacts).**
 *
 * 🔴 Les deux conversions passent par une **chaîne**, jamais par une
 * multiplication flottante. `19,99 × 100 000` vaut `1998999.9999999998` en
 * binaire : un arrondi le rattrape aujourd'hui, mais c'est de la chance, et
 * c'est exactement ce que `millicentsOf` existe pour supprimer.
 *
 * `toFixed(5)` plutôt que `String()` : il borne à la précision du millicentime
 * **et** ne produit jamais de notation exponentielle — `String(1e-7)` rend
 * « 1e-7 », que le lecteur de prix refuse, et la ligne tomberait en silence.
 */
export function eurosIn(draft: DraftPrices, sku: string): number | null {
  const millicents = millicentsIn(draft, sku);
  return millicents === null ? null : Number(millicentsField(millicents).replace(',', '.'));
}

/** Le champ rend `null` quand on le vide : l'article sort de la grille. */
export function withEuros(draft: DraftPrices, sku: string, euros: number | null): DraftPrices {
  return euros === null ? withoutPrice(draft, sku) : withPrice(draft, sku, euros.toFixed(5));
}

/**
 * La grille reprise depuis un **brouillon** enregistré.
 *
 * Distincte de {@link draftFromView}, qui part de ce qui est POSÉ : l'une reprend
 * une négociation en cours, l'autre ouvre une renégociation sur ce qui a été
 * accordé. Les confondre ferait écraser un brouillon par les prix en vigueur au
 * premier rechargement de la page.
 */
export function draftFromLines(lines: readonly CompanyMercurialeLinePayload[]): DraftPrices {
  return new Map(lines.map((line) => [line.sku, millicentsField(line.unitPriceMillicents)]));
}

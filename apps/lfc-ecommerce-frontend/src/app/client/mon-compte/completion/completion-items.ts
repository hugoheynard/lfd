import type { CompanyActivationStep } from '@lfd/b2b-ui/company';
import type { ActivationGate, CompanyView, MintBlocker } from '@lfd/contracts';

import { fill } from '../../copy/client-copy.service';
import type { AccountCopy, CompletionCopy } from '../../copy/screens/account.copy';
import { canWriteAddresses } from '../addresses/addresses-section';

/**
 * **Ce qui manque au dossier**, tel que Mon compte le dit — la table du §2.2 du
 * plan `documentation/b2b/plan-mon-compte-a-completer.md`, et rien d'autre.
 *
 * Aucune règle d'activation ici : le serveur dit ce qui bloque (`ActivationGate`)
 * et ce qui empêche de générer le mandat (`mintBlockers`). Cette fonction ne
 * fait que trier ces codes par carte, leur donner un titre et un geste.
 */

/** Un élément de la table du plan. */
export type CompletionKey = keyof CompletionCopy['items'];

/** La carte de Mon compte où l'élément se complète. */
export type CompletionCard = 'identity' | 'users' | 'kbis' | 'addresses' | 'bank';

/** Le dialogue que le geste ouvre — le même que celui de la carte. */
export type CompletionTarget = 'identity' | 'contacts' | 'kbis' | 'billing' | 'delivery' | 'bank';

export interface CompletionItem {
  readonly key: CompletionKey;
  readonly title: string;
  readonly detail: string;
  /** Le libellé du geste, ou **vide** quand le rôle ne peut pas écrire là : pas de bouton qui finirait en refus. */
  readonly action: string;
  readonly card: CompletionCard;
  readonly target: CompletionTarget;
  /** Cet élément empêche-t-il l'activation ? Le serveur le dit, on ne le redéduit pas. */
  readonly blocking: boolean;
}

/** Ce que l'écran sait au moment de dresser la liste. */
export interface CompletionFacts {
  /**
   * `null` = verdict pas lu, ou lecture en échec : les lignes qu'il porte se
   * taisent, celles qui n'en dépendent pas restent — un échec de lecture ne
   * masque jamais un manque connu par ailleurs.
   */
  readonly gate: ActivationGate | null;
  readonly company: CompanyView;
  readonly deliveryCount: number;
  readonly mintBlockers: readonly MintBlocker[];
  /** La section mandat est-elle montrée ? (rôle du RIB, RIB enregistré, drapeau ouvert). */
  readonly mandateShown: boolean;
  readonly mandateActive: boolean;
}

const PLACEMENT: Readonly<
  Record<CompletionKey, { readonly card: CompletionCard; readonly target: CompletionTarget }>
> = {
  identity: { card: 'identity', target: 'identity' },
  vat: { card: 'identity', target: 'identity' },
  telephone: { card: 'users', target: 'contacts' },
  billing: { card: 'addresses', target: 'billing' },
  delivery: { card: 'addresses', target: 'delivery' },
  kbis: { card: 'kbis', target: 'kbis' },
  bank: { card: 'bank', target: 'bank' },
};

/** Les mentions du mandat qui se saisissent dans l'identité légale. */
const IDENTITY_MINT: ReadonlySet<MintBlocker> = new Set(['company_name_missing', 'siren_missing']);

/**
 * Les mentions du mandat qui se saisissent dans le RIB. `issuer_missing` n'est
 * dans aucune des deux : ce n'est pas au client d'agir (plan §2.2).
 */
const BANK_MINT: ReadonlySet<MintBlocker> = new Set([
  'bank_account_missing',
  'holder_legal_form_missing',
]);

/**
 * Les éléments à compléter, dans l'ordre de la table du plan.
 *
 * - sans verdict lu, seules les lignes qui n'en dépendent pas restent :
 *   livraison et mentions du mandat ;
 * - `detenteur` ne s'affiche jamais : celui qui lit est déjà rattaché ;
 * - le SIREN et la raison sociale du mandat rejoignent la ligne identité, aux
 *   mêmes conditions que le RIB ;
 * - le KBIS ne manque que si **aucun** extrait n'est déposé — déposé non
 *   certifié, la carte KBIS le dit déjà ;
 * - la livraison ne manque que si la préférence d'acheminement est la livraison ;
 * - le RIB ne manque que si la section mandat est montrée et qu'aucun mandat
 *   n'est actif.
 */
export function completionItems(
  facts: CompletionFacts,
  copy: AccountCopy,
): readonly CompletionItem[] {
  const { gate, company } = facts;
  const blockers = gate?.blocking ?? [];
  const make = (key: CompletionKey, detail: string, blocking: boolean): CompletionItem => ({
    key,
    title: copy.completion.items[key].title,
    detail,
    action: actionable(key, company) ? copy.completion.items[key].action : '',
    ...PLACEMENT[key],
    blocking,
  });
  const texts = copy.completion.items;
  const items: CompletionItem[] = [];

  // Les mentions du mandat ne se réclament que là où le mandat se génère : section
  // montrée, aucun mandat actif — son papier signé les porte déjà.
  const mint = facts.mandateShown && !facts.mandateActive ? facts.mintBlockers : [];
  const legal = blockers.includes('identite_legale');
  const identityMint = mint.filter((code) => IDENTITY_MINT.has(code));
  if (legal || identityMint.length > 0) {
    const parts = [
      ...(legal ? [texts.identity.detail] : []),
      ...(identityMint.length > 0 ? [mandateFields(identityMint, copy)] : []),
    ];
    items.push(make('identity', parts.join(' '), legal));
  }
  if (blockers.includes('vat')) {
    items.push(make('vat', texts.vat.detail, true));
  }
  if (blockers.includes('telephone')) {
    items.push(make('telephone', texts.telephone.detail, true));
  }
  if (blockers.includes('facturation')) {
    items.push(make('billing', texts.billing.detail, true));
  }
  if (company.fulfillmentPreference.method === 'delivery' && facts.deliveryCount === 0) {
    items.push(make('delivery', texts.delivery.detail, false));
  }
  const kbis = gate?.checklist.find((check) => check.piece === 'kbis');
  if (kbis !== undefined && !kbis.done && company.kbis === null) {
    items.push(make('kbis', texts.kbis.detail, kbis.blocking));
  }
  const bankMint = mint.filter((code) => BANK_MINT.has(code));
  if (bankMint.length > 0) {
    items.push(make('bank', `${texts.bank.detail} ${mandateFields(bankMint, copy)}`, false));
  }
  return items;
}

/**
 * Les lignes du composant partagé `lfd-company-activation-checklist`.
 *
 * Sur une société **en attente**, chaque ligne dit si elle empêche l'activation.
 * Sur une autre, aucune ne le dit : un compte actif ne s'active plus, et
 * `blocking` omis efface la mention « n'empêche pas » du composant.
 */
export function completionSteps(
  items: readonly CompletionItem[],
  pending: boolean,
  copy: AccountCopy,
): readonly CompanyActivationStep[] {
  return items.map((item) => ({
    key: item.key,
    title: item.title,
    detail:
      pending && item.blocking
        ? fill(copy.completion.blocksActivation, { detail: item.detail })
        : item.detail,
    cta: item.action,
    kind: 'action',
    ...(pending ? { blocking: item.blocking } : {}),
  }));
}

/** « 1 élément à compléter », « 3 éléments à compléter ». */
export function completionCount(count: number, copy: AccountCopy): string {
  return count === 1 ? copy.completion.countOne : fill(copy.completion.count, { n: String(count) });
}

/** Les éléments d'une carte, dans l'ordre de la liste. */
export function completionFor(
  items: readonly CompletionItem[],
  card: CompletionCard,
): readonly CompletionItem[] {
  return items.filter((item) => item.card === card);
}

/** Les adresses ne s'écrivent qu'à `owner`/`admin` ; les autres dialogues s'ouvrent en lecture. */
function actionable(key: CompletionKey, company: CompanyView): boolean {
  return key === 'billing' || key === 'delivery' ? canWriteAddresses(company) : true;
}

function mandateFields(codes: readonly MintBlocker[], copy: AccountCopy): string {
  return fill(copy.completion.mandateFields, {
    fields: codes.map((code) => copy.mandateBlockers[code]).join(', '),
  });
}

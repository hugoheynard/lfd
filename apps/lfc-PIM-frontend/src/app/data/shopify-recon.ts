import type { ShopifyCollection, TvaRegime } from './models';

/** Une collection de taxe est-elle déjà sur la boutique, ou reste-t-elle à pousser ? */
export type TvaCollectionState = 'present' | 'missing';

/** Un régime rapproché de son éventuelle collection distante. */
export interface TvaCollectionRow {
  regimeId: string;
  name: string;
  percent: number;
  /** Handle attendu côté Shopify — le tag du régime (`tva-5-5`). */
  handle: string;
  state: TvaCollectionState;
  /** La collection distante rapprochée, si elle existe. */
  remote: ShopifyCollection | null;
}

/** Le résultat d'une inspection : rapprochement complet + orphelines. */
export interface TvaReconciliation {
  rows: TvaCollectionRow[];
  /** Collections `tva-*` présentes sur la boutique sans régime correspondant. */
  orphans: ShopifyCollection[];
  missingCount: number;
}

/**
 * Rapproche les régimes de TVA voulus et le miroir des collections Shopify —
 * pur, sans effet de bord. Chaque régime devient une ligne (présente ou
 * manquante) ; une collection `tva-*` que plus aucun régime ne réclame est une
 * orpheline à réconcilier.
 */
export function reconcileTvaCollections(
  regimes: readonly TvaRegime[],
  mirror: readonly ShopifyCollection[],
): TvaReconciliation {
  const byHandle = new Map(mirror.map((c) => [c.handle, c]));
  const wanted = new Set<string>();

  const rows: TvaCollectionRow[] = regimes.map((regime) => {
    wanted.add(regime.tag);
    const remote = byHandle.get(regime.tag) ?? null;
    return {
      regimeId: regime.id,
      name: regime.name,
      percent: regime.percent,
      handle: regime.tag,
      state: remote === null ? 'missing' : 'present',
      remote,
    };
  });

  const orphans = mirror.filter(
    (c) => c.handle.startsWith('tva-') && !wanted.has(c.handle),
  );
  const missingCount = rows.filter((r) => r.state === 'missing').length;

  return { rows, orphans, missingCount };
}

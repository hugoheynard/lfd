/**
 * **Les taux de TVA en pourcentages, par clé de contexte** — ce qu'une
 * facture lit. Clé absente = contexte non réglé ; jamais un taux inventé.
 *
 * Le catalogue rend la donnée, jamais le mot d'un canal : chaque canal dérive
 * ce dont il a besoin de ces nombres.
 */
export type CategoryVatPercents = Readonly<Record<string, number>>;

/**
 * Des identifiants de taux par contexte → leurs pourcentages.
 *
 * Un identifiant qui ne désigne aucun taux ne produit **pas de clé** : le
 * contexte est alors non réglé, comme s'il n'avait jamais été renseigné. C'est
 * le seul choix sûr — inventer un taux ici facturerait un client.
 */
export function resolvePercents(
  vatByContext: Readonly<Record<string, string>>,
  percentById: ReadonlyMap<string, number>,
): CategoryVatPercents {
  const percents: Record<string, number> = {};
  for (const [contextKey, rateId] of Object.entries(vatByContext)) {
    const percent = percentById.get(rateId);
    if (percent !== undefined) {
      percents[contextKey] = percent;
    }
  }
  return percents;
}

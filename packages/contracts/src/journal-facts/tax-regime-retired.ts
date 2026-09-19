import { z } from "zod";

import { blastByNamedContexts, payload, percent, retired, type JournalFactFamily } from "./fact.js";

/**
 * **Les taux de TVA quand ils s'appelaient « régimes »** — quatre types
 * retirés, encore en base de dev (TODO des phrases du journal, 2026-09-19).
 *
 * Nés le 2026-08-21 à 13 h 46 (`6959131d`), renommés `tax_rate.*` le même jour
 * à 16 h 07 (`d4849851`) **sans migration de données** — le commit le dit :
 * « ces types sont nés ce matin et n'existent que dans la base de dev ». La
 * migration qui a porté `tax_rate.*` vers `vat_rate.*` (`ff1bf13a`) ne les a
 * pas vus. Deux lignes `tax_regime.rate_changed` du 21 août s'affichaient
 * depuis comme un fait inconnu.
 *
 * Deux formes par type, parce que la charge a changé entre les deux commits :
 * `de033f98` (15 h 42) a retiré le `tag` (`tva-5-5`, le handle Shopify dérivé
 * du taux) quand la colonne a quitté la table. La forme SANS tag est posée en
 * courante, celle d'avant en histoire — l'ordre ne décide rien pour un type
 * retiré, les deux se lisent (formes relues dans git le 2026-09-19).
 *
 * Aucune n'a jamais porté de nom de sujet : le sujet (`tva_regime`) se dit par
 * le `name` de la charge. `tax_regime.renamed` n'en a pas davantage — l'avant
 * et l'après SONT les noms.
 */

/** Le handle Shopify du taux, dérivé de son pourcentage (`tva-5-5`). */
const tag = () => z.string();

const snapshot = payload({ name: z.string(), percent: percent() });
const snapshotTagged = snapshot.extend({ tag: tag() });

/**
 * La portée, en deux comptes nommés : les familles qui visaient ce taux à
 * emporter et sur place (`familiesEmporter`, `familiesSurPlace`). Toujours
 * écrite par ce type.
 */
const rateChanged = payload({
  name: z.string(),
  from: percent(),
  to: percent(),
  blast: blastByNamedContexts(),
});
const rateChangedTagged = rateChanged.extend({ tag: tag() });

export const TAX_REGIME_FACTS = {
  "tax_regime.created": retired(snapshot, [snapshotTagged]),
  "tax_regime.rate_changed": retired(rateChanged, [rateChangedTagged]),
  /** Le nom avant et après ; le taux n'a pas bougé. */
  "tax_regime.renamed": retired(payload({ from: z.string(), to: z.string() })),
  "tax_regime.deleted": retired(snapshot, [snapshotTagged]),
} as const satisfies JournalFactFamily;

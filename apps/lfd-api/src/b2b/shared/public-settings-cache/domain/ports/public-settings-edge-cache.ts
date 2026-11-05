/**
 * L'étiquette des réglages publics gardés par Workers Cache : les quatre
 * routes (`/content/footer`, `/order-opening`, `/delivery-zones`,
 * `/delivery-availability`) la posent, la purge la nomme, et le Worker ne
 * purge que les étiquettes de sa liste fermée (`PUBLIC_SETTINGS_TAG`,
 * `container/public-shelf.ts` ; les deux comparés par
 * `container/__tests__/public-shelf.spec.ts`).
 *
 * UNE étiquette pour les quatre : ce sont des réglages lus ensemble par la
 * boutique, écrits rarement, et une purge commune coûte moins qu'une liste
 * fermée qui grandit d'une étiquette par réglage.
 */
export const PUBLIC_SETTINGS_CACHE_TAG = "reglages-publics";

/**
 * **Oublier les réglages publics gardés en bordure** (2026-11-05) : Workers
 * Cache garde toute réponse `public` du Worker, ces quatre routes comprises.
 * Sans purge, un réglage changé se verrait à l'échéance du cache (au plus
 * 1 min 30, cf. `public-settings-cache-headers.ts`).
 *
 * Le seul port partagé du commerce pour ces quatre contextes, et c'est une
 * règle commune, pas du code semblable (CLAUDE.md §3, `b2b/shared`) : une
 * étiquette, une durée, une purge — que chacun déclarerait à l'identique.
 *
 * Depuis le 2026-11-05, la liste publique des points de retrait
 * (`GET /pickup-addresses`, `public-pickup-cache-headers.ts`) porte la même
 * étiquette : ses écrivains — points, rôles d'un site, et les cinq gestes
 * d'une promotion, dont vient la remise annoncée — purgent par ce port.
 * Un geste de promotion écrit dans sa propre transaction (le dépôt l'ouvre) :
 * hors d'une unité ambiante, `AfterCommit` exécute la purge aussitôt après.
 *
 * Appelé APRÈS la validation de l'écriture (`AfterCommit`), jamais pendant.
 * Un adaptateur peut lever : l'appelant ne l'attend pas, et l'échec se
 * journalise sans retenir l'écriture.
 */
export abstract class PublicSettingsEdgeCache {
  abstract purge(): Promise<void>;
}

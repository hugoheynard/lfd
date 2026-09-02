/**
 * **Le filtre du retrait**, écrit une fois et lu partout.
 *
 * Depuis que le retrait marque au lieu de supprimer, toute lecture de
 * `catalog_items` qui l'oublie **remet un article retiré en vente**. C'est la
 * dette la plus insidieuse de ce chantier, et pour une raison de nature : les
 * autres réserves sont des absences — on sait qu'on n'a rien. Celle-ci est une
 * régression introduite par une amélioration, sur une surface en service, et le
 * geste qui la crée est motivé par la sécurité des données.
 *
 * ## Pourquoi une constante, et pas une extension du client
 *
 * Le plan proposait une extension `$extends` qui injecterait la condition dans
 * chaque `where`, sur le modèle de `countedPrisma`. Deux faits l'ont écartée, et
 * aucun des deux ne se voyait sans ouvrir le code :
 *
 * 1. **Elle devrait vivre dans `platform/`.** L'extension ne tient à l'intérieur
 *    d'une transaction que si elle est posée SOUS le routage transactionnel —
 *    c'est le client global qui ouvre l'unité de travail, et un client cadré
 *    construit par-dessus verrait ses lectures re-routées vers un client de
 *    transaction sans extension. Or `platform/` ne connaît aucun contexte : un
 *    socle qui sait qu'une table `catalog_items` existe n'est plus un socle. Le
 *    franchissement ne passerait ni par un import ni par une jointure, donc
 *    aucune porte ne le verrait.
 * 2. **Le motif se serait perdu là où il compte le plus.** `accept-delivery` lit
 *    le miroir DANS une transaction ; un filtre qui s'y évapore ferait revenir
 *    un article retiré comme « déjà connu », donc rafraîchi au lieu d'être remis
 *    en vente. Silencieusement.
 *
 * Ce qui reste est plus modeste et vrai partout : la condition est nommée, elle
 * s'épand dans le `where`, et `pnpm lint:withdrawn-filter` refuse qu'une
 * nouvelle lecture de `catalogItem` naisse ailleurs que dans les adaptateurs
 * qui la portent.
 *
 * ⚠️ **Les lectures seulement.** Un `upsert` filtré serait un piège exact : le
 * `where` ne verrait pas la ligne retirée, Prisma tenterait une création, et la
 * clé primaire refuserait — un article qui revient au catalogue ferait tomber le
 * push. Écrire doit voir toute la table ; c'est en la LISANT qu'on ment.
 */
export const STILL_SOLD = { withdrawnAt: null } as const;

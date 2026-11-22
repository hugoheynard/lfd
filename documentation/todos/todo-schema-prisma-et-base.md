# TODO — le schéma Prisma dit la base

> **Ouvert le 2026-11-22**, à la demande de Hugo (« note ce chantier en
> dette »). Trouvé pendant le lot D1 du paiement : `prisma migrate diff`
> entre une base construite par les migrations et le schéma Prisma rendait
> 12 écarts, tous antérieurs, sans qu'aucune porte ne les voie.

## Ce que c'est

La base de production est celle que les migrations ont construite ; c'est
**le schéma Prisma** qui la décrit mal par endroits. Rien ne casse
aujourd'hui, mais une future `prisma migrate dev` proposerait de « corriger »
la base dans le mauvais sens, et le client Prisma ignore des règles que la
base applique.

## Les écarts relevés (base de test, 2026-11-22)

| #    | Écart                                                                      | Ce que dit la base                                          | Geste                                                 |
| ---- | -------------------------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| 1    | `pim.ingredient.appellation_id_fkey`                                       | `ON DELETE RESTRICT`                                        | `onDelete: Restrict` au schéma                        |
| 2    | `payment_mandates.creditor_id_fkey`                                        | `ON DELETE RESTRICT`                                        | `onDelete: Restrict` au schéma                        |
| 3    | `price_floors_scope_id_idx`                                                | index créé en SQL                                           | l'index déclaré au schéma                             |
| 4    | `companies.granted_terms`                                                  | défaut « tableau vide »                                     | `@default([])` au schéma                              |
| 5    | `mercuriale_drafts.updated_at`                                             | `timestamptz`, défaut `now()`                               | type et défaut au schéma                              |
| 6    | `collection_batch_line_invoice_line_fkey`                                  | ce nom de clé                                               | `map:` au schéma                                      |
| 7–8  | `pim.tva_rate` : `tva_regime_pkey`, `tva_regime_percent_key`               | les anciens noms (table renommée, pas ses contraintes)      | `map:` au schéma                                      |
| 9–10 | `cart.shop_carts_user_company_unique`, `promotion_audience_targets_unique` | unicités partielles en SQL                                  | **volontaires**, documentées au schéma : liste admise |
| 11   | `pim.product_variant.price_per_kg_shown`                                   | colonne morte gardée (coupée en public / pro le 2026-10-29) | **volontaire** : ne se supprime que sur ordre de Hugo |

## À faire

- [x] ~~Corriger 1 à 8 dans le schéma seulement, sans migration~~ (2026-11-22).
- [x] ~~Une porte `schema-drift`~~ (2026-11-22 : `dev-toolbox/gates/schema-drift.mjs`, liste admise `apps/lfd-api/prisma/schema-drift-admitted.json`, en CI dans le premier éclat des e2e, qui a Postgres) : : `prisma migrate diff` des migrations vers
      le schéma, avec une base fantôme, ne rend rien hors une liste admise et
      datée (9, 10, 11) ; une entrée admise qui ne sort plus échoue aussi.
- [ ] **Comparer la production elle-même**, depuis le poste de Hugo et en
      lecture seule : la comparaison ci-dessus part d'une base construite par
      les migrations, et un geste SQL passé à la main en production (runbook)
      n'y paraîtrait pas.
- [ ] Décider du sort de `price_per_kg_shown` (n° 11) : la supprimer est une
      migration, sur ordre de Hugo.

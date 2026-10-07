# L'architecture du bloc `delivery`

> Sous-dossier de [`livraisons/`](../README.md), rangé le 2026-10-07 (Hugo).
> Les états ci-dessous sont ceux que chaque document déclare en tête.

Comment le bloc est isolé des autres (frontières, canaux, schéma Postgres `delivery`), et le plan qui lui a donné son schéma.

| Doc                                                                          | État et sujet                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`architecture-isolation-livraison.md`](architecture-isolation-livraison.md) | ✅ référence — **L'isolation de la livraison** : ses **22** tables du schéma `delivery`, **11** ports et 1 fait vers le commerce, 3 ports et 2 faits vers le retrait, les **4** canaux qui la touchent (dont colisage et fournil), 7 tables qui font bouger sa version, les portes et ce qu'elles ne voient pas. Recompté le 2026-10-07. |
| [`plan-schema-delivery.md`](plan-schema-delivery.md)                         | ✅ bâti, déployé 2026-09-30 — Le déménagement des tables de livraison de `production` vers `delivery`, les vues de compatibilité, le journal et la version de la livraison.                                                                                                                                                              |

## Ce qui fait foi

- **La frontière** : `architecture-isolation-livraison.md` est la référence —
  tables du schéma `delivery`, ports vers le commerce et le retrait, canaux du
  colisage et du fournil, et les portes qui tiennent la frontière (§ 6).
- **Ce que le bloc n'est pas encore** : son § 7.
- **Ajouter quelque chose à la livraison** : son § 8, la marche à suivre pour
  un développeur.
- `plan-schema-delivery.md` est l'histoire du déménagement vers le schéma
  `delivery` : bâti, gardé pour ses décisions.

Les autres thèmes du dossier, et les documents qui touchent la livraison sans
en être le sujet, sont listés dans l'[index du dossier](../README.md).

# Plan — le prix pro est toujours saisi : retirer la suggestion et le rapport

> 📝 **Plan, rien n'est bâti** (2026-10-27). Demande de Hugo : « le système de
> suggestion de prix dans la fiche produit doit disparaître, il induit en
> erreur avec le système de règle comptable, tout sera désormais du prix
> saisi ». Touche au prix : `vitruve` obligatoire avant de bâtir (§ 6).

## 1. Ce qui existe (relu le 2026-10-27)

- **Deux méthodes de prix pro** (`ProPriceMethodSetting`,
  `apps/lfd-api/src/pim/accounting-rules/domain/value-objects/pro-price-method-setting.ts`) :
  `entered` — le prix pro HT saisi par déclinaison, seule source, méthode
  d'une base vierge depuis le lot S (2026-10-16) — et `ratio_ttc`, le repli
  d'origine par le rapport (`pro_price_ratio_bp`, « le pro paie 10 % de
  moins »), gardé pour une base qui n'a pas fait « Passer au prix saisi ».
- Le réglage vit dans `pim.accounting_rules` (`pro_price_method`, défaut SQL
  `ratio_ttc` jamais lu ; `pro_price_ratio_bp`, contrainte
  `accounting_rules_pro_ratio_bounds`). Sans ligne, le réglage vaut `entered`.
- **La suggestion** : dans la fiche produit, section Prix, « Suggéré : X € HT
  (rapport de 90 %) » et un bouton qui la reprend
  (`product-form-store.ts` `proPriceSuggestion` / `takeProPriceSuggestion`,
  `pricing-form.html`, `pro-price-entry.ts`).
- **Le pré-remplissage en masse** : aperçu et application d'un prix pro tiré
  du rapport sur les déclinaisons sans prix pro
  (`preview-pro-price-prefill.ts`, `apply-pro-price-prefill.ts`,
  `pro-price-prefill.controller.ts`, écran des règles comptables).
- **La complétude** porte une clé `pro_price_rule` : sous `ratio_ttc`, une
  déclinaison sans rapport réglé n'est pas vendable
  (`variant-completeness.ts`).
- Le rapport circule aussi dans la projection vers le commerce (tests de
  parité `ratio-parity*`), les révisions du catalogue (`attribution.ts`,
  `revision.ts`) et le journal (`pim-journal.ts`, faits du rapport).

Hugo pense que la production est sur `entered` ; ce n'est **pas vérifié**.

## 2. Ce qui change

**R1 — la suggestion disparaît de la fiche** (écran seul). La ligne
« Suggéré », son bouton et son calcul sont retirés. Aucun prix ne change.

**R2 — le pré-remplissage en masse disparaît** (API et écran des règles
comptables). Il ne sait faire qu'une chose : tirer un prix du rapport.

**R3 — la méthode `ratio_ttc` est retirée.** Le prix pro n'a plus qu'une
source, la saisie.

- **Une migration qui refuse plutôt que de supposer** : elle commence par
  `RAISE EXCEPTION` si une ligne de `pim.accounting_rules` porte une autre
  méthode que `entered`, avec un message qui nomme le geste de sortie
  (« Règles comptables → Passer au prix saisi », qui fige les prix). Le
  déploiement s'arrête alors avant toute écriture, et aucun prix ne bouge.
  Ensuite seulement : défaut SQL passé à `entered`, et contrainte
  `accounting_rules_method_known` resserrée à `entered`.
- **Les colonnes restent** (pré-release, mais une colonne morte reste en base
  — CLAUDE.md § 0) : `pro_price_ratio_bp` n'est plus lu.
- **Le code** : `ProPriceMethodSetting` à une seule valeur, ou retiré au
  profit d'une constante ; `proPriceOf` ne lit que la saisie ; la clé
  `pro_price_rule` sort de la complétude (et de `productCompliance`) ;
  l'écran des règles comptables perd le choix de méthode, le rapport et
  « Passer au prix saisi » ; les tests de parité du rapport partent avec lui.
- **Ce qui reste** : les **faits passés** du journal qui parlent du rapport
  restent lisibles (une valeur n'est pas un nom, CLAUDE.md § 8) — leurs
  phrases ne sont pas retirées.

## 3. Ce qui ne bouge pas

- Le prix public TTC saisi, les taux, la tarification B2B (mercuriales,
  règles, `resolvePrice`).
- Les prix pro **déjà saisis** : aucune ligne de `product_variant` n'est
  écrite.
- Sous `entered`, `proPriceOf` rend déjà la saisie seule : en production
  (si `entered`), aucune valeur servie ne change.

## 4. Lots

| Lot | Contenu                                                                   | Garde                                                                                                                                               |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Retrait de la suggestion dans la fiche                                    | tests de la fiche ; aucune route API touchée                                                                                                        |
| R2  | Retrait du pré-remplissage (API + écran)                                  | recensement des appelants ; e2e `pim-pro-price`                                                                                                     |
| R3  | Migration gardée, méthode unique, complétude sans `pro_price_rule`, écran | e2e de la migration sur une base en `ratio_ttc` (elle doit échouer) et en `entered` (passer) ; catalogue servi identique avant/après sous `entered` |

R1 ne dépend de rien et part seul. R2 et R3 attendent `vitruve`.

## 5. Questions

- **Q1 — tranchée le 2026-10-27** : Hugo a constaté sur l'écran des règles
  comptables de production la méthode **« prix saisi »** (`entered`). Le
  pré-remplissage n'a donc plus rien à figer en production ; R2 peut partir.
  La garde de la migration de R3 reste en dernier filet.

## 6. Relecture `vitruve` (2026-10-27)

Trois bloquants — **R2 et R3 ne se bâtissent pas avant leur résolution** :

1. **« Passer au prix saisi » ne fige aucun prix** (`choose-pro-price-method.ts:66-78`
   change la méthode et réémet, sans écrire un seul prix pro) ; c'est le
   **pré-remplissage** qui fige. Si la production est en `ratio_ttc`, retirer
   R2 d'abord, puis basculer, ferait sortir du catalogue pro toute déclinaison
   sans saisie (`proPriceOf` → `null`, `catalog-facts.ts:205-211`). Ordre
   imposé : constater la méthode en production ; si `ratio_ttc`, pré-remplir
   **puis** basculer ; R2 seulement ensuite.
2. **Une migration qui échoue bloque tous les déploiements suivants** (P3009,
   `prisma migrate resolve --rolled-back` à la main en production). La garde
   par `RAISE EXCEPTION` est donc un dernier filet, pas le mécanisme : la
   méthode se constate **avant** de pousser R3, et la phrase de runbook est
   écrite.
3. **Le semis et 17 suites e2e reposent sur `ratio_ttc`** sans saisir aucun
   prix pro (`seed-pim/registry.ts:58-66`, `test/pim-sellable.ts:80-90`,
   `test/catalog-facts-scene.ts:90-96`) ; une base de dev semée est en
   `ratio_ttc` et l'API locale refuserait de démarrer. R3 commence par
   faire saisir des prix pro au semis et aux fixtures.

Sérieux à trancher avant R3 : en-tête des révisions (`proRatioBp`,
`proPriceMethod` — ne plus les écrire ferait un faux changement), faits du
journal à garder (`accounting_rules.method_changed`,
`accounting_rules.pro_ratio_changed`, `product.pro_price_prefilled`, et la
constante que lit `attribution.ts:42`), clé `pro_price_rule` stockée côté
commerce, contrat partagé `ProPricePolicy` (racine), lectures du rapport dans
`product-form-store.ts` hors suggestion (`proPriceAt`, `discountLabel`), garde
e2e de la migration irréalisable telle qu'écrite, ~75 fichiers concernés.

**R1 n'est touché par aucune objection** et part seul.

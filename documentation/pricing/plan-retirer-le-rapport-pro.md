# Plan — le prix pro est toujours saisi : retirer la suggestion et le rapport

> 🟡 **R1 et R2 bâtis et commités, R3 bâti le 2026-10-27, non commité**
> (§ 4). Plan écrit le 2026-10-27. Demande de Hugo : « le système de
> suggestion de prix dans la fiche produit doit disparaître, il induit en
> erreur avec le système de règle comptable, tout sera désormais du prix
> saisi ». Touche au prix : `vitruve` obligatoire avant de bâtir (§ 6).

## 1. Ce qui existe (relu le 2026-10-27)

- **Deux méthodes de prix pro** (`ProPriceMethodSetting`,
  apps/lfd-api/src/pim/accounting-rules/domain/value-objects/pro-price-method-setting.ts (retiré le 2026-10-27)) :
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
  (aperçu, écriture et leur contrôleur dans `product/` du catalogue, écran
  des règles comptables) — retiré le 2026-10-27 par R2.
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

| Lot | Contenu                                                                                                         | Garde                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Retrait de la suggestion dans la fiche                                                                          | tests de la fiche ; aucune route API touchée                                                                                                        |
| R2  | Retrait du pré-remplissage (API + écran) — **bâti le 2026-10-27, non commité**                                  | recensement des appelants ; e2e `pim-pro-price`                                                                                                     |
| R3  | Migration gardée, méthode unique, complétude sans `pro_price_rule`, écran — **bâti le 2026-10-27, non commité** | e2e de la migration sur une base en `ratio_ttc` (elle doit échouer) et en `entered` (passer) ; catalogue servi identique avant/après sous `entered` |

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

## 7. Décisions avant de bâtir R2 et R3 (2026-10-27)

Hugo : « lance R2 et R3 ». La production est en `entered` (Q1). Les points
sérieux de `vitruve` sont tranchés ainsi :

- **Ordre** : R2, commité et vert, puis R3. R1 est bâti (`4f6f26fac`).
- **Semis et fixtures d'abord** (bloquant 3) : `seed-pim/registry.ts`,
  `test/pim-sellable.ts` et `test/catalog-facts-scene.ts` cessent de poser
  `ratio_ttc` et **saisissent un prix pro HT** par déclinaison — au même
  montant que le rapport donnait (prix public × 90 % au taux b2b), pour que
  les e2e qui comptent des prix pros gardent leurs chiffres. C'est le premier
  geste de R3, avant toute retouche du domaine.
- **Migration** : `UPDATE` de la méthode à `entered` **pour les bases de dev
  et de test** n'est pas fait par la migration ; la migration lève
  l'exception si une ligne n'est pas `entered`, avec un message qui dit le
  geste local (`pnpm --filter lfd-api seed:pim` après le nouveau semis, ou
  « Passer au prix saisi » dans le back-office local). Garde vérifiée par un
  test qui exécute le SQL de garde sur une transaction annulée (pas par un
  e2e de migration, irréalisable). Phrase de runbook dans
  `documentation/ops/runbook.md` : P3009 et `migrate resolve --rolled-back`.
- **`pro_price_ratio_bp`** reste en base (colonne morte), plus lu ; une ligne
  neuve y écrit la valeur existante ou la valeur par défaut actuelle — rien
  d'inventé.
- **Révisions** : l'en-tête garde ses deux champs, figés à leur dernière
  valeur écrite par une constante (`entered`, rapport `null`) ; le diff
  ignore ces deux champs quand la méthode n'existe plus, pour ne pas montrer
  un faux changement.
- **Journal** : les faits `accounting_rules.method_changed`,
  `accounting_rules.pro_ratio_changed`, `product.pro_price_prefilled` restent
  déclarés et lisibles (faits passés), leurs constantes aussi (lues par
  `attribution.ts:42`) ; aucune nouvelle émission. L'enum du journal n'est
  pas resserré.
- **`pro_price_rule`** : la clé sort du calcul ; son **libellé reste** dans la
  table unique des manques (entrées publiées avant).
- **Contrat partagé** `ProPricePolicy` / `PRO_PRICE_METHODS` : réduit côté
  logique, champs gardés pour la lecture des révisions ; `pnpm test` racine
  au commit.
- **Écran** : la fiche lit le prix pro saisi seul (`proPriceAt`,
  `discountLabel`, `source: 'ratio'` retirés) ; les règles comptables perdent
  méthode, rapport, pré-remplissage et « Passer au prix saisi ».

## 8. Ce que R3 a bâti (2026-10-27)

- **Semis et fixtures d'abord** : le corpus porte un `proPriceHt` par fiche,
  figé au montant que le rapport donnait (90 % au taux b2b) ; `registry.ts`
  ne pose plus aucune règle comptable ; `pim-sellable.ts` et
  `catalog-facts-scene.ts` saisissent `1.70616` € HT (200 c public, 5,5 %).
  Les 18 suites e2e qui les importent sont restées vertes avant toute retouche
  du domaine.
- **Migration** `20261027110000_le_prix_pro_est_toujours_saisi` : garde
  `RAISE EXCEPTION` entre deux marqueurs, puis défaut `entered` et contrainte
  `accounting_rules_method_known` resserrée. Éprouvée par
  `test/pro-price-entered-migration.e2e-spec.ts` (bloc relu dans le fichier,
  transaction annulée). Phrase de runbook : « Avant de déployer « le prix pro
  est toujours saisi » ».
- **Domaine** : le contexte `src/pim/accounting-rules/` est retiré entier
  (agrégat, VO, ports, handlers, contrôleur, routes) — il n'avait plus ni
  lecteur ni écrivain. `proPriceOf(taux, saisie)` vit dans
  `packages/pim-contracts/src/pro-price.ts` ; `ProPricePolicy`,
  `PRO_PRICE_METHODS`, `UNSET_PRO_PRICE_POLICY`, les schémas et la vue des
  règles quittent `@lfd/pim-contracts` (la liste des méthodes reste dans
  `@lfd/contracts`, pour relire les faits passés). La complétude ne lit plus
  de politique ; `pro_price_rule` n'est plus calculé. L'en-tête des révisions
  est `ENTERED_PRO_PRICE_HEADER`, et `headerDiff` tait le rapport quand les deux
  côtés sont en `entered`. Les tests `ratio-parity*` sont retirés.
- **Écran** : la fiche lit la saisie seule ; la page « Règles comptables » ne
  dit plus que où le prix pro se saisit (aucun appel serveur).

**Écart au § 7** : le message de la garde ne cite pas `seed:pim` comme sortie
locale suffisante. Le nouveau semis n'écrit plus aucune règle comptable : le
relancer sur une base existante en `ratio_ttc` n'en change pas la méthode. Le
message nomme « Passer au prix saisi » avec la version précédente, ou une base
vierge (`dev:infra:nuke` puis `seed:pim`).

**Reste à décider** : la page « Règles comptables », sa route et son entrée du
rail n'ont plus rien à régler — les retirer, ou y loger une future règle de
la maison.

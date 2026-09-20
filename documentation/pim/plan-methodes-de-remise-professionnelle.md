# Plan — deux méthodes de remise professionnelle, une seule appliquée

> **État : BÂTI le 2026-09-13.** Ce qui suit est le plan tel qu'il a été
> conçu, corrigé et tranché ; le code livré le suit, à trois exceptions près
> notées au §9.
> Écrit le 2026-09-13, contredit par `vitruve` le même jour. Touche **l'argent**
> et porte une **migration de données** (CLAUDE.md §9bis).
>
> 🔴 **La première version de ce document se trompait de SENS** au §3 : elle
> annonçait la méthode B plus chère que la méthode A. Elle est moins chère,
> d'environ 12 % sur un article à 5,5 %. Les §2, §3, §5, §6 et §7 sont corrigés
> ci-dessous.
>
> ✅ **Le §3 est tranché** (Hugo, 2026-09-13) — voir la décision qui y figure.

## 1. Ce qui est demandé

Dans _Règles comptables_, pouvoir **ajouter une règle** et **choisir laquelle
s'applique**.

| Méthode | Nom demandé                              | Calcul demandé                                                        |
| ------- | ---------------------------------------- | --------------------------------------------------------------------- |
| A       | **Ratio TTC pré-remise**                 | l'actuelle — remise appliquée au prix public TTC                      |
| B       | **Remise après plus haute TVA possible** | TTC public − le plus haut taux de TVA existant (20 %), puis la remise |

Trois contraintes explicites :

- le **% de remise reste la saisie** — une seule, partagée par les deux méthodes ;
- on doit pouvoir **sélectionner** la méthode appliquée ;
- on doit pouvoir **comparer** les deux, et la comparaison **montre l'écart** ;
- la méthode B est celle de la **plaquette commerciale** : le dire à l'écran.

## 2. L'existant, vérifié

- `AccountingRules` est un **singleton** qui ne porte qu'un champ :
  `proPriceRatioBp` (`accounting-rules.ts`). Pas de méthode, pas de fenêtre de
  validité — seulement un `updatedAt`.
- La saisie est **déjà une remise** : l'écran prend « Remise (%) » et le
  convertit en rapport avant d'envoyer (`accounting-rules-page.html`). La
  demande « garder le % en input » est donc **déjà satisfaite** ; ce qui change,
  c'est ce qu'on fait de ce nombre.
- Le calcul vit dans le **contrat** — `proPriceFromPublic(publicTtcCents,
ratioBp)` dans `@lfd/pim-contracts` — et il a **quatre** appelants, pas deux
  (vérifié le 2026-09-13) : `pro-price-ratio.ts:50`, `projection.ts:187`,
  `accounting-rules-page.ts:197`, et **`product-form-store.ts:698` + `:707`** —
  la fiche produit, que le lot 4 oubliait. Un écran laissé en arrière
  afficherait le prix de la méthode A pendant que le fil pousse l'autre.
- La chaîne actuelle, dans cet ordre : `publicTtc` → **`proTtc`** (arrondi au
  centime, c'est un prix) → **`proHt`** (déduit du taux du canal). L'ordre est
  documenté et défendu : le TTC fait foi, le HT en est la conséquence.
- La projection B2B applique le rapport à chaque article
  (`projection.ts:proPriceFromPublic`) et **refuse de pousser** tant que le
  rapport n'est pas réglé (`ProPriceRatioNotSetError`).
- Le référentiel des taux expose `listAll()` — le plus haut taux est donc
  **dérivable**, il n'a pas à être écrit en dur.

⚠️ **DEUX affirmations de l'écran sont fausses**, pas une : le callout
(`accounting-rules-page.html:124`) **et** le JSDoc du composant
(`accounting-rules-page.ts:87`, « ⚠️ Rien ne lit encore ce rapport »). Le `fold-callout` du bas dit
« **Pas encore appliquée** — aucun prix ne s'en sert pour l'instant ». C'est
faux depuis que la projection B2B tarife : elle refuse même de partir sans le
rapport. À corriger dans le même chantier, sans quoi on bâtit une comparaison
de méthodes sous une phrase qui dit que rien n'est appliqué.

## 3. 🔴 La question que la demande ne trancheche pas

**Que produit la méthode B — un TTC ou un HT ?**

Retirer la TVA d'un prix TTC donne un **hors taxe**. Appliquer la remise dessus
donne donc un **prix pro HT**, alors que la méthode A produit un **prix pro
TTC** dont le HT se déduit ensuite, canal par canal.

Les deux méthodes ne produisent pas la même **nature de nombre**, et c'est le
cœur du sujet — pas l'écart de montant :

- **Méthode A** — un seul prix pro TTC pour tous les contextes ; le HT varie
  avec le taux du canal. « Le pro paie 10 % de moins que l'étiquette. »
- **Méthode B** — un prix pro HT unique, **indépendant du taux du canal** ; le
  TTC pro varie alors d'un contexte à l'autre. « Le pro paie 10 % de moins que
  le HT le plus défavorable. »

Ce n'est pas un détail d'arrondi : sur un article vendu en B2B à 5,5 % de TVA,
la méthode B facture comme si la TVA était de 20 %, donc **plus cher** que la
méthode A à remise égale. C'est cohérent avec une plaquette commerciale (un
tarif annoncé qui ne dépend pas du régime), et c'est une **décision
commerciale**, pas une variante technique.

**Ce plan ne choisit pas à la place d'Hugo.** Il propose l'option B-HT (le
résultat est un prix pro **HT**, le TTC s'en déduit par le taux du canal) parce
que c'est la seule lecture qui donne un sens à « soustraire le plus haut taux » ;
si l'intention était un prix pro **TTC**, la soustraction de 20 % n'est plus
qu'un coefficient de 1/1,2 déguisé, et il faut le dire ainsi.

## 4. Le plus haut taux : lu, jamais écrit en dur

`20 %` est aujourd'hui le plus haut taux **du référentiel**, pas une constante
fiscale. Deux mauvaises réponses et une bonne :

- **l'écrire en dur** — nombre magique (§6), et faux le jour où la loi bouge ;
- **le lire en silence** — créer un taux à 25 % pour un cas isolé retariferait
  **tout le catalogue professionnel** sans qu'une ligne ne bouge. De l'action à
  distance sur de l'argent, c'est la pire classe de défaut de ce dépôt ;
- **le lire ET l'afficher** — ⚠️ **écarté** par la décision du §3 : le taux est
  FIGÉ dans le réglage. Conservé ici pour mémoire, parce que la promesse
  « jamais invisible » ne tenait pas telle quelle : `VatRateRepository` expose aussi
  `save()` et `remove()` (`vat-rate.repository.ts:31-33`). **Modifier** le taux
  à 20 % ou **supprimer** le plus haut déplace le maximum sans passer par la
  création, donc sans avertissement. Et un avertissement est une _vérification_
  — le cran le plus faible — là où ce paragraphe dit lui-même que l'action à
  distance sur l'argent est la pire classe de défaut.

⚠️ Ce paragraphe renverse aussi une décision écrite sans la nommer :
`accounting-rules-page.ts:40` fige `SAMPLE_RATES = [5.5, 10, 20]` avec son motif
(« ferait dépendre cet écran d'un autre, ferait varier l'exemple d'un jour à
l'autre »). Il faut l'ouvrir et dire pourquoi elle est périmée, pas l'ignorer.

✅ **Retenu : une valeur figée dans le réglage comptable**, saisie avec la
méthode. Le référentiel des taux peut la proposer par défaut à la saisie —
jamais la changer après coup. C'est ce qui rend le §4 sans objet.

## 5. Ce que « sélectionner la méthode » coûte vraiment

Basculer la méthode **retarife le catalogue professionnel entier**. Trois
conséquences à assumer plutôt qu'à découvrir :

1. **l'empreinte de projection change**, donc le prochain aperçu d'envoi
   montrera _tout_ le catalogue en `changed` ;
2. **le contrôle de parité** signalera un écart de prix sur chaque article tant
   que le push n'est pas fait ;
3. **une commande déjà passée** n'est pas touchée — elle porte son snapshot de
   prix — mais une commande **en cours de saisie** peut changer de total entre
   l'ouverture de l'écran et la validation.

🔴 **Et surtout : « retarife le catalogue professionnel entier » est FAUX.** Le
prix poussé n'est pas le prix facturé — c'est le `canonicalMillicents`, « le
nombre sur lequel s'appliquent la mercuriale, les paliers, les promotions et le
plancher » (`catalogue-article.ts:12`). Trois conséquences que le PIM ne peut
même pas chiffrer :

- **les planchers en montant absolu ne bougent pas** (`resolve-floor.ts:84` :
  `floor.mode === "amount" ? floor.millicents : …`). Baisser le canonique de
  ~12 % peut donc faire **remonter** un prix par son plancher — le mode de
  défaillance exact que `lint:dated-decisions` existe pour ne plus revoir ;
- **tous les planchers en euros passent en `stale` d'un coup** :
  `floor-drift.ts:27` fixe le seuil à 500 bp, soit 5 % ;
- **les articles à prix B2B négocié ne bougent pas du tout** (`localPrice`).

D'où : la bascule est un geste **confirmé**, et le compte d'articles touchés ne
peut PAS être calculé côté PIM — il ne connaît ni les overrides, ni les
mercuriales, ni les planchers. Soit la confirmation se contente de dire ce
qu'elle ne sait pas, soit le chiffre vient d'une lecture côté plateforme, et
c'est un lot de plus.

## 6. La fenêtre de validité — la question que le dépôt a déjà payée

`lint:dated-decisions` existe parce qu'un plancher tarifaire sans fenêtre a
produit des prix historiques gonflés, et a coûté une migration de schéma pour le
rattraper. Il ne couvre que les cinq familles de `PricingMaterials`, donc il ne
verra pas cette bascule.

La question qu'il incarne se pose pourtant à l'identique : **« quelle méthode
s'appliquait le 3 mars ? »**. ⚠️ **Le plan affirmait que le passé n'est pas reconstituable. C'est faux** :
`take-catalog-revision.ts:83` écrit `proRatioBp` dans l'en-tête de **chaque
révision**, et `diff.ts:59-66` en fait une ligne de diff. Le passé du rapport se
lit donc révision par révision.

Conséquence directe pour ce chantier : **la méthode doit entrer dans cet
en-tête** (colonne `Json`, donc sans migration) et dans `field-label.ts`. Sans
ça, une bascule produit une révision où tous les articles changent et dont
l'en-tête n'explique rien.

Deux postures, à trancher :

- **assumer** — la méthode est un réglage courant, le passé se lit dans les
  snapshots de commandes, et le journal garde la trace du changement. C'est ce
  que le plan retient, parce que c'est ce qui est déjà vrai du rapport et que
  l'étendre serait un autre chantier ;
- **dater** — `AccountingRules` devient une suite de décisions à fenêtre. Plus
  juste, nettement plus cher, et sans utilité tant que rien ne relit un prix à
  une date passée autrement que par un snapshot.

## 7. Le découpage proposé

| Lot | Portée                                                                                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Le contrat** : `ProPriceMethod = "ratio_ttc" \| "remise_apres_tva_max"`, la seconde fonction de calcul, les tests des deux                                                                                                                                                                                                                                               |
| 2   | **Le domaine** : `AccountingRules` gagne sa méthode, son VO, son refus ; migration additive (colonne `method` avec défaut `ratio_ttc`)                                                                                                                                                                                                                                     |
| 3   | **La projection** : la méthode et le taux max lui sont **PASSÉS**, jamais lus — `projection.ts:37` promet « pure et testable : aucun appel réseau ». Et trancher le sort de `variant_sans_taux` (`projection.ts:191`), dont le motif n'a plus de sens si le HT ne dépend plus du taux du canal                                                                             |
| 4   | **Les DEUX écrans** : règles comptables (sélection, comparaison chiffrée, mention plaquette) **et fiche produit** (`product-form-store.ts:698`). Plus les quatre phrases devenues fausses : le callout et le JSDoc « pas encore appliquée », la phrase « la remise s'applique avant toute TVA » et le `sample-say` « le taux ne change pas ce que le professionnel gagne » |
| 5   | **La révision** : `proRatioBp` a un voisin `method` dans l'en-tête, sans quoi un diff de bascule n'explique rien                                                                                                                                                                                                                                                           |

La migration est **additive** (§0) : colonne ajoutée avec le défaut qui
reproduit le comportement actuel. Aucun déploiement ne change un prix par
lui-même — il faut un geste pour basculer.

## 8. Ce que ce plan n'a PAS vérifié

- si la plaquette commerciale existante applique bien ce calcul-là, et sur quel
  taux — **personne n'a ouvert la plaquette** ;
- ce que la plateforme B2B fait du prix reçu quand le régime du canal diffère du
  taux max : `projection.ts` pousse un HT, mais le chemin d'affichage côté
  client n'a pas été relu ;
- s'il existe des commandes en cours dont le total bougerait à la bascule ;
- ce que `lfc-ecommerce-frontend` affiche du prix reçu (HT + TVA, ou TTC
  recomposé) — l'écart **perçu par le client pro** dépend de ce chemin ;
- que `pim/channels/b2b-platform/` puisse importer `pim/vat-rates/domain/ports/`
  — la matrice du §3 est au niveau des blocs, donc `pim → pim` devrait passer,
  à confirmer d'un `pnpm lint:context-boundaries` ;
- le **seed** sème 5,5 / 10,1 / 20 (`seed-pim/catalogue.ts:88`). Le jour où la
  prod porte un taux que le seed n'a pas, tout prix pro calculé en dev diverge
  de la prod — e2e compris.

---

## 9. Ce qui a été bâti, et ce qui s'en écarte

Livré en un commit : le calcul dans `@lfd/pim-contracts` (`proPriceOf`, l'unique
porte pour les quatre appelants), le value object qui lie la méthode à son taux
figé, une migration additive avec sa contrainte `CHECK`, la route
`PUT /pim/accounting-rules/pro-price-method`, la projection qui **reçoit** la
politique, l'en-tête de révision, et l'écran avec son sélecteur et son
comparateur.

Trois écarts au plan, assumés :

- **le taux figé est saisi, pas proposé par le référentiel.** Le §4 envisageait
  de le lire pour le proposer ; l'écran propose simplement 20 %, le nombre de la
  plaquette. Lire le référentiel pour une valeur de départ aurait rouvert la
  dépendance que le §3 ferme ;
- **le compte d'articles touchés par une bascule n'est pas affiché.** Le §5 dit
  pourquoi il est incalculable côté PIM. L'écran dit ce qu'il ne sait pas — les
  prix négociés ne bougeront pas, un plancher en euros peut faire remonter un
  prix — plutôt que d'annoncer un chiffre faux ;
- **le §6 reste sur « assumer »** : pas de fenêtre de validité. Le passé se lit
  dans l'en-tête des révisions, qui porte désormais les deux décisions.

Le lecteur de migrations a confirmé (2026-09-13) que la contrainte `CHECK` passe
sur la ligne de production existante (`ratio_ttc` + taux `NULL`), que
`accounting_rules_pro_ratio_bounds` est préservée, et qu'aucun prix ne change au
déploiement.

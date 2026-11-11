# Audit des docs de la saisie — document par document

> 🧭 **Document de travail, 2026-11-11.** Les dix documents de la saisie
> confrontés au code (quatre lectures en parallèle, puis vérification directe
> des points porteurs). Il sert à les reprendre **un par un** avec Hugo ; il
> disparaît quand la doc d'état « Saisir un prix » existe et que les plans
> sont retirés.

## Ce qui est vérifié pour tous

- **Tout est commité** : l'arbre de travail est propre (2026-11-11).
- Chaque plan de `pricing/saisie/` est **bâti**, sauf le lot **P1** (la liste
  de gauche de la saisie au prix du client) et deux restes nommés plus bas.
- Le principe commun tient : **un écran ne calcule pas un prix**, il
  l'affiche ; le calcul est celui de la caisse.

## La cible

Une doc d'état unique, au présent, **« Saisir un prix »** (à créer dans `pricing/saisie/`)
(Partie 1 : comprendre ; Partie 2 : le code) :

1. **Les écrans de tarification** — grille datée, frise, comparaison, banc
   d'essai, gabarits ; la fiche client « Tarifs » renvoie aux docs des
   mercuriales.
2. **Le prix d'un article dans sa fiche** — prix pro saisi, carte Tarif &
   TVA, prix au kilo et sa visibilité par audience, kilo sous promotion, prix
   manquant non bloquant.
3. **Changer l'unité de vente** — le verrou « référence déjà servie ».
4. **Le report après détachement** — les six familles.
5. **Le prix pendant la saisie d'une commande** — l'estimation qui compose
   la commande, les écarts E1 à E5 tranchés.
6. **Ce qui reste.**

Restent à part : `vente-au-poids.md` (sujet entier, à compléter) et
`commandes/passation/architecture-commande-saisie-par-l-equipe.md` (à
corriger).

---

## 1. `plan-prix-de-la-saisie.md`

- [ ] **Repris**

**État réel** — P2 bâti, **serveur et écran** :
`admin-order-estimates.controller.ts:33-34`,
`estimate-order-for-customer.handler.ts`, `staff-order-preparation.ts:46-88`
(partagé avec la passation) ; front `nouvelle-commande-page.ts:378-443`,
`order-estimate.ts` (accalmie 400 ms), `estimate-changes.ts`.

**Faux ou périmé**

- « P2b — front : à bâtir » (l. 167) : il est bâti.
- Le tableau « Ce qui est faux aujourd'hui » décrit le 2026-11-03 (le panier
  appelait `/admin/orders/quote`) : plus vrai.
- « Avant, il garde le devis actuel (sous-total) » : le panier dit « Prix à
  confirmer » sans estimation (`order-estimate.ts:198,209`).
- Corps de l'estimation : `adminOrderEstimatePayloadSchema`
  (`packages/contracts/src/admin-order.ts:152`), pas le schéma de passation.
- E1 à E5 titrés « à trancher » alors que la section suivante les dit
  tranchés ; lignes de code citées pour E1 et E2 fausses.
- « Le lien de règlement disparaît au comptoir » décrit au futur : fait
  (`nouvelle-commande-page.ts:359`).
- Le panier dit HT au compte et TTC au lien (`order-estimate.ts:200-201`) ;
  le plan parle d'un total TTC seul.

**Juste, à garder** — « une seule arithmétique » (l'estimation passe par
`OrderDrafting.draft`) ; les écarts E1–E5 et leur arbitrage ; `quote` reste
pour le simulateur et la boutique ; P1 et sa raison de report.

**Reste à faire** — **P1** (`commandes/catalog.service.ts:31` lit
`/admin/catalog/sellable`, sans prix client), à re-planifier avec une mesure
de coût.

**Devient** — § 5 de « Saisir un prix ».

---

## 2. `commandes/passation/architecture-commande-saisie-par-l-equipe.md`

- [ ] **Repris**

**État réel** — noyau livré (`place-order-for-customer.handler.ts`,
`OrderDrafting` partagé, `staff-order-preparation.ts`).

**Faux ou périmé**

- « Le seul montant affiché est le sous-total HT » : le panier affiche le
  total du serveur (`order-estimate.ts:155-166`).
- « `GET /admin/catalog` » : c'est `/admin/catalog/sellable`.
- « Deux modes, le lien Stripe » : au comptoir ou en retrait immédiat, le lien
  est refusé (`order-supply-rules.ts:102-104`) — non dit.
- Rien sur l'estimation, `entryOrigin`, le comptoir, E1–E5.
- `orderOriginOf()` : la fonction s'appelle `orderEntryOriginOf`
  (`order-origin.ts:51`) — à vérifier.
- « Le lien de règlement ne part par aucun e-mail » : non vérifié depuis le
  bloc `mail/`.

**Juste, à garder** — pas d'union `customer_order | platform_order` ; le mur
sur l'acheteur, pas sur l'acteur ; `settlement` sans défaut ; brouillon
partagé ; pas de carte saisie par l'équipe.

**Devient** — corrigé sur place (il reste dans `commandes/`), avec un renvoi
vers le § 5 de « Saisir un prix ».

---

## 3. `ecrans-de-tarification.md`

- [ ] **Repris**

**État réel** — bâtis : lecture datée (`admin-pricing.controller.ts:86-91`),
comparaison (`:101-106`), `readForScreen`, frise, banc d'essai
(`MAX_PROBES = 8`), gabarits, projection (borne de vingt-quatre niveaux :
`packages/contracts/src/pricing.ts:1570`, vérifié).

**Faux ou périmé**

- Chemins `/reglages/tarification…` : l'écran vit sous `/promotions`,
  `/promotions/simulateur`, `/promotions/frise`.
- « Le seul endroit par lequel passent les deux chemins » de
  `catalog_price_history` : **trois** écrivains
  (`prisma-catalog-item.repository.ts`,
  `prisma-catalog-product-facts.projection.ts`,
  `prisma-catalog-price-retracer.ts`) — vérifié.
- « Quatre fichiers importent `@lfd/contracts` dans `pricing/domain` » :
  huit aujourd'hui.
- Le seuil de 1,5 % de la frise est dans `timeline-axis.ts:35`, pas
  `axis-model.ts`.
- Comparatif des mercuriales : le domaine compte **une observation par
  client** (`mercuriale-benchmark.ts`, vérifié), la requête en émet une par
  palier et la « correction du 2026-09-09 » décrit l'inverse.
- Rien sur la fiche client « Tarifs » refaite le 2026-11-11.

**Juste, à garder** — « un écran ne calcule rien » (grille, comparaison,
banc) ; décisions en vigueur ce jour-là ≠ prix facturé ; régime de la
comparaison ; R2 ouvert.

**Reste à faire** — **R2** : sortir `revenue-model.ts` du navigateur (quatre
importeurs) ; **vérifier** que les trois écrivains de l'historique écrivent
la même chose ; aligner le commentaire du comparatif.

**Devient** — § 1 de « Saisir un prix ».

---

## 4. plan-carte-tarif (retiré, absorbé dans « Saisir un prix », § 2)

- [ ] **Repris**

**État réel** — bâti : deux cases par audience
(`price_per_kg_shown_public` / `_pro`, `product.prisma:273,275`, migration
`20261029160000`), commande et front.

**Faux ou périmé** — rien.

**Reste à faire** — retirer la colonne morte `price_per_kg_shown` (ordre de
Hugo, 2026-11-11), **en deux déploiements** :

1. ✅ 2026-11-11 — le champ quitte le schéma Prisma ; la colonne reste en
   base. (Prisma lit toutes les colonnes déclarées : supprimer la colonne
   dans le même déploiement ferait tomber en erreur chaque lecture d'une
   fiche ou d'un rayon par l'API d'avant, entre la migration et le
   démarrage du nouveau code — relu par `lecteur-de-migrations`.)
2. ⏳ **Au déploiement suivant**, une fois l'étape 1 en production — la
   migration :

   ```sql
   SET lock_timeout = '5s';
   ALTER TABLE "pim"."product_variant" DROP COLUMN IF EXISTS "price_per_kg_shown";
   ```

   Destructive : la valeur figée au 2026-10-29 est perdue (elle a été
   recopiée dans `_public` / `_pro` par `20261029160000`). Les faits passés
   du journal gardent leur clé `pricePerKgShown`.

**Devient** — § 2 de « Saisir un prix ».

---

## 5. plan-retirer-le-rapport-pro (retiré, absorbé dans « Saisir un prix », § 2)

- [ ] **Repris**

**État réel** — R1 à R3 bâtis ; la table `accounting_rules` est supprimée
(migration `20261104110000_le_rapport_pro_quitte_la_base`).

**Faux ou périmé**

- En-tête « non commité » : tout est commité.
- § 2 et § 7 « la colonne `pro_price_ratio_bp` reste en base » : la table
  entière est supprimée.
- Citations du fichier `choose-pro-price-method`, retiré, et de
  `catalog-facts.ts:205-211` (déplacé).
- § 1 « Hugo pense… pas vérifié » contre § 5 « tranchée » : garder le § 5.

**Reste à faire** — vérifier les routes de pré-remplissage (R2).

**Devient** — une phrase du § 2 de « Saisir un prix » (« le prix pro est
toujours saisi ») ; le reste est de l'histoire, dans git.

---

## 6. plan-prix-au-kilo (retiré, absorbé dans « Saisir un prix », § 2)

- [ ] **Repris**

**État réel** — K0 à K5 bâtis (migration `20261028210000`,
`update-variant-pricing.ts`, `snapshot-catalog-price-per-kg.reader.ts`,
`pricing-form.html:116-146`, `shop-price-basis.service.ts:97-110`).

**Faux ou périmé**

- « Le fil passe en v13 » : il est en **v17** (`snapshot.ts:24`).
- « L'héritage dans `product.ts` (l. 635-640) » : `product.ts:940-969`.
- « `null` = rien ne s'affiche » : il existe un second levier, la
  **visibilité par audience** (`price_per_kg_shown_public` / `_pro`), que le
  plan ignore.

**Juste, à garder** — deux montants saisis, aucun calcul, CHECK > 0,
informatif ; le kilo ne traverse pas la résolution ; public en TTC, pro en HT.

**Devient** — § 2 de « Saisir un prix ».

---

## 7. plan-prix-au-kilo-suit-le-prix (retiré, absorbé dans « Saisir un prix », § 2)

- [ ] **Repris**

**État réel** — bâti : `servedPricePerKg`
(`shop-catalogue-promoted-per-kg.ts:39`, arithmétique entière), kilo barré à
l'écran (`shop-price-basis.service.ts:140-158`).

**Faux ou périmé**

- § 2 (« le kilo monte dans la même proportion ») rayé au § 7, sans bandeau.
- § 4 (ordre `struck` → kilo) corrigé au § 5 bis, sans bandeau ; l'ordre
  réel : prix → noms de promotion → offres → kilo.
- « E2E non écrite » : `shop-catalogue-price-per-kg.e2e-spec.ts` existe
  (contenu à relire).

**Juste, à garder** — la règle du § 7 : kilo barré seulement quand une
promotion nommée baisse la pièce ; hausses et mercuriales gardent le kilo
saisi ; base TTC pour le public ; vente au poids exclue.

**Reste à faire** — vérifier la vitrine ; la question réglementaire du § 6
reste **ouverte** (ne pas l'écrire comme acquise).

**Devient** — § 2 de « Saisir un prix ».

---

## 8. `plan-changer-l-unite-de-vente.md`

- [ ] **Repris**

**État réel** — bâti au § 8 : le verrou est « **référence déjà servie** »
(`variant.ts:698-738`, `SaleReferenceInUseError`,
`SaleReferenceUsageUnknownError`, port `SaleReferenceUsage`, route
`:id/sale-unit-usage`) ; le panier retire la ligne (`removedLines`, raison
`sale_unit_changed`) ; e2e `sale-unit-change`, `sale-reference-usage`.

**Faux ou périmé**

- § 1 à § 7 décrivent l'**ancien verrou** (`SaleUnitFrozenError` — absente
  du code, vérifié ; port `SaleUnitChangeBlockers` — renommé), sans bandeau.
- Lignes de `invoice-lines.ts` décalées.
- Commentaire périmé côté front : `pim/data/models.ts:129` (« déjà
  publiée… figée »).

**Reste à faire**

- Le fait de journal **`variant.sale_unit_changed` n'est pas bâti** (aucune
  occurrence dans `journal-facts`, vérifié).
- Le trou du § 9 (une déclinaison au poids devenue défaut) — renvoie à
  `catalogue/plan-defaut-sous-sa-reference.md`, non vérifié.

**Devient** — § 3 de « Saisir un prix » ; recoupe le § 1–2 de
`vente-au-poids.md`.

---

## 9. `plan-report-apres-detachement.md`

- [ ] **Repris**

**État réel** — R0 à R6 bâtis pour les **six familles** (migration
`20261030230000`, `decision-carry-over.ts`, routes de report par famille,
front `decision-carry-over/`).

**Faux ou périmé**

- § 0 « le report n'existe que pour la mercuriale », « origine absente des
  quatre tables », « seule la mercuriale est reportable à l'écran » : faux
  depuis R0–R6.
- Q1 et Q3 « à trancher » : tranchés au § 7 bis et bâtis.
- Table du § 4 : anciennes routes ; les vraies sont dans
  `admin-pricing-carry-over.controller.ts`, `admin-price-floors.controller.ts:151`,
  `admin-volume-commitments.controller.ts:80`,
  `admin-price-templates.controller.ts:146`.
- § 8 « Questions ouvertes » : toutes tranchées.

**Juste, à garder** — poser une décision neuve, jamais réécrire ; fenêtre
« max(maintenant, début) → fin réelle » ; refus nommés ; décisions du § 7 bis.

**Reste à faire** — relever les e2e par famille (non constatés) ; dire que
le refus rétroactif d'un gabarit n'est tenu que par le domaine.

**Devient** — § 4 de « Saisir un prix ».

---

## 10. plan-prix-manquant-non-bloquant (retiré, absorbé dans « Saisir un prix », § 2)

- [ ] **Repris**

**État réel** — P1 à P4 bâtis (fil nullable `snapshot.ts:202,249` ;
migration `20261027170000` ; constat `price_missing_for_audience` en
avertissement).

**Faux ou périmé**

- La suite e2e `catalog-parity` citée n'existe pas.
- « Quinze fichiers lisent `priceMillicents` » : dix-neuf aujourd'hui (à
  recompter par la commande, pas de mémoire).
- Corps au futur alors que bâti.
- La migration cite le plan sous `documentation/pricing/` (il est sous
  `saisie/`) : référence morte dans un `migration.sql`, **à ne pas corriger**.

**Juste, à garder** — vendable à chaque audience dont la déclinaison a le
prix ; `null` = pas vendable, jamais gratuit ; TVA toujours exigée ;
avertissement qui ne bloque pas l'activation.

**Reste à faire** — vérifier la sortie aval (boutique, devis, CSV, badge du
rayon) ; écrire ou retirer `catalog-parity`.

**Devient** — § 2 de « Saisir un prix ».

---

## 11. `pricing/vente-au-poids.md` (déjà doc d'état)

- [ ] **Repris**

**État réel** — le plus à jour.

**Faux ou périmé** — « fil v14 » : v17.

**Reste à faire** — y ajouter le prix au kilo d'une **pièce** et sa
visibilité par audience (ou renvoyer au § 2 de « Saisir un prix »).

**Devient** — reste à part, corrigé.

---

## Questions de fond relevées

1. **Le comparatif des mercuriales** : par client (le domaine) ou par palier
   (la requête et la doc) ? Le résultat servi est par client ; la doc et un
   commentaire disent l'inverse.
2. **L'historique des prix catalogue** : trois écrivains là où la doc promet
   un seul passage. Vérifier qu'ils écrivent la même chose.

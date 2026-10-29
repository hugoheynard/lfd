# Un tarif daté sur une référence : un ajout, pas une re-signature

> 📐 Doc-first, écrit le 2026-10-29. Plan seulement, aucun code. Tout ce qui est affirmé ici a été ouvert le 2026-10-29. Ce qui ne l'a pas été figure au § 6.

## 0. Ce que dit le code aujourd'hui

- **La mercuriale est un document entier.** `CompanyMercuriale.lines` est un jsonb `[{ sku, tiers }]`. Le commentaire du schéma l'explique : la grille « s'écrit **entière** ou pas du tout », justement pour empêcher qu'on insère une ligne seule (`apps/lfd-api/prisma/schema/public/pricing.prisma:303-313`). La table porte **une seule** fenêtre `validFrom`/`validTo` pour tout le document (`:319-320`).
- **Une seule mercuriale par client à un instant donné.** La contrainte d'exclusion est partielle, elle ne porte que sur les mercuriales non closes. La pose refuse donc un chevauchement avec une mercuriale en cours (`RunningMercurialeError`). Elle refuse aussi un chevauchement avec une mercuriale close qui a déjà facturé (`PricedPeriodIsSealedError`) (`apps/lfd-api/src/b2b/pricing/application/commands/pose-company-mercuriale.handler.ts:70-92`). Conséquence : ajouter une ligne aujourd'hui, c'est **réécrire** le jsonb ou poser une seconde mercuriale. La seconde voie est refusée tant que la première court.
- **Le moteur lit déjà une mercuriale comme une règle.** `asRuleFor` cherche la ligne par `context.productSku` et rend une `PriceRule` avec `stage: "mercuriale"`, `audience: company`, `scope: product`, `nature: "replace"` et la fenêtre **du document** (`domain/entities/company-mercuriale.ts:258-295`). Elle rejoint les autres règles dans `resolve-price.ts:265-268`.
- **Les règles posées à l'étage mercuriale existent déjà hors du document.** `PRICE_STAGES = ["mercuriale", …]` (`domain/price-rule.ts:23`). Un gabarit posé chez un client « devient N règles de l'étage mercuriale » (`pricing.prisma`, commentaire de `PriceTemplate`, vers `:345`). Dans la résolution, l'étage choisit un gagnant parmi les règles applicables (`winnerOf`, `resolve-price.ts:113`), et ce gagnant **scelle** la chaîne (`:149-151`).
- **La lecture datée existe.** `liveFor(companyId, at)` lit l'état courant. `liveAsOf(companyId, at)` sert à relire le passé : une mercuriale ouverte l'emporte sur une close, puis la plus récente l'emporte (`infrastructure/prisma-company-mercuriale.reader.ts:28-80`).
- **La porte `lint:dated-decisions`** (`dev-toolbox/gates/dated-decisions.mjs`) contrôle chaque champ de `PricingMaterials`. Le fichier qui déclare le type de chaque champ doit prononcer `validFrom`. La liste des exemptions (`EXEMPT`) est vide.
- **Le journal.** La pose écrit un acte (`subjectType: "mercuriale"`, `kind: "posed"`, `summary` figé) au moment de `save` (`pose-company-mercuriale.handler.ts:111-124`). `PricingEvent.summary` est « FIGÉE à l'écriture » (`pricing.prisma:536-538`).
- **La liste du L7c** lit déjà les mercuriales qui contiennent un sku via `lines array_contains [{ sku }]` (`infrastructure/prisma-sale-reference-decisions.reader.ts:47-61`), avec les règles, planchers, barèmes, engagements et gabarits. La gestion des déclinaisons s'arrête là (`documentation/catalogue/plan-pro-voit-les-declinaisons.md:286-295`, la question « seconde mercuriale ou extension » y est laissée ouverte).

## 1. Le modèle : l'ajout daté est une **règle d'étage mercuriale** de portée société

**Recommandation : une décision à part, et non une ligne du jsonb avec sa propre fenêtre.**

L'ajout daté est une `PriceRule` avec :

- `stage = "mercuriale"`
- `audience = company:<id>`
- `scope = product:<sku>` ou `variant:<sku>`
- `nature = "replace"`
- un ou plusieurs paliers, sa **propre** fenêtre `validFrom` / `validTo`

Pourquoi pas une ligne du jsonb datée :

- elle casse l'invariant « s'écrit entière » (`pricing.prisma:305-308`) ;
- `UPDATE` d'un document que des commandes ont déjà cité, c'est réécrire l'histoire, ce que R17 a coûté à apprendre (en-tête de `dated-decisions.mjs`) ;
- `asRuleFor` devrait apprendre une fenêtre par ligne ;
- la porte ne verrait rien : elle contrôle le type, pas une fenêtre logée dans un jsonb.

Pourquoi une règle :

- le moteur sait déjà la résoudre, la dater (`isInForce`), la suspendre, la clore et la journaliser ;
- elle passe déjà la porte (`PriceRule` porte `validFrom`) ;
- les gabarits posés chez un client prouvent que la forme « N règles de l'étage mercuriale, audience company » est déjà exploitée.

**Lecture à une date.** Pour `at`, les matériaux contiennent la mercuriale vivante (`liveFor` ou `liveAsOf`) et les règles en vigueur. Pour le sku servi, deux cas :

- **La grille du document ne porte pas le sku** (le cas visé : un produit ou une déclinaison qui apparaît). `asRuleFor` rend `null`, la règle ajoutée est la seule candidate de l'étage, elle gagne et scelle.
- **Le document porte déjà le sku.** Deux règles se disputent l'étage et `winnerOf` arbitre par spécificité, puis selon ses autres critères (non ouverts). Pour éviter un arbitrage implicite, la pose de l'ajout **refuse** un sku déjà présent dans la grille de la mercuriale vivante sur la fenêtre demandée. Changer un prix négocié, c'est renégocier le document.

Point à vérifier au premier lot : `missesTierFor` (`company-mercuriale.ts:311`) crée une trace « rejet » quand la grille porte l'article sans palier atteint. Ça ne doit pas masquer l'ajout. Comme on refuse un sku déjà dans la grille, le cas ne devrait pas se présenter, mais un test doit le confirmer.

**Ce que voit le client.** La même chose que pour une ligne de mercuriale : un prix d'étage mercuriale, qui ferme la chaîne. La trace porte le `label` de la règle. Proposition : par défaut, le libellé de la mercuriale vivante suivi de « — ajout du JJ/MM ». Le client lit ainsi un seul tarif négocié, avec une ligne datée. L'écran client n'a pas été ouvert (§ 6).

**Fenêtre.** `validFrom` vaut au plus tôt maintenant, car la pose rétroactive sur une période qui a facturé est refusée comme pour la mercuriale (`PricedPeriodIsSealedError`). `validTo` reprend par défaut le `validTo` de la mercuriale vivante, pour que l'ajout meure avec le document qu'il complète. S'il n'y a pas de mercuriale vivante, l'ajout reste possible : c'est simplement une règle négociée.

## 2. Un seul geste pour les deux cas

Le geste s'appelle « Ajouter un tarif daté à <société> pour <référence> ». Il vise une référence en vente : on garde le contrôle `assertOnSale` du L5, comme dans `pose-company-mercuriale.handler.ts:62-65`.

- **Apparition d'un produit ou d'une déclinaison.** Le commercial choisit la société, la référence, le prix (ou les paliers) et la date d'entrée. Il n'y a pas de re-signature.
- **L7c, report d'une déclinaison détachée.** On part de `GET admin/pricing/sale-references/:sku/decisions`. Pour chaque mercuriale qui contient l'ancien sku, on propose un ajout daté sur le nouveau sku :
  - même société ;
  - mêmes paliers, lus dans la ligne de la grille ;
  - `validFrom` = date du détachement ou maintenant ;
  - `validTo` = celui de la mercuriale.

  Garde : la nouvelle référence doit porter `detached_from_sku` = l'ancienne (`plan-pro-voit-les-declinaisons.md:292`). Pour les autres familles (règles, planchers, barèmes, engagements), on pose une nouvelle décision par famille, comme prévu au L7c. Le cas mercuriale est le seul qui manquait d'un chemin sans réécriture, et l'ajout daté le fournit.

- **On ne retire jamais la ligne de l'ancien sku.** Elle n'agit plus de toute façon, puisque l'ancienne référence n'est plus en vente.

## 3. Ce qui reste de la « signature »

D'après ce qui a été ouvert, **il n'existe aucun acte de signature client pour la mercuriale**. Il y a `sign-volume-commitment.*` pour l'engagement de volume. Pour la mercuriale, on trouve seulement `pose`, `close`, `rename`, `save-draft` et `discard-draft` (`application/commands/`). Une recherche de « mercuriale » dans les fichiers mail, pdf et notif ne renvoie qu'une spec de mail de commande (`platform/mailer/__tests__/order-placed-mail.spec.ts`), qui n'a pas été lue. « Signer », c'est donc aujourd'hui un acte **staff** (`createdBy`, plus l'acte `posed` au journal), et l'accord du client se fait hors système.

Pour rester opposable, un ajout daté doit tracer :

1. un acte `PricingEvent` `posed`, avec l'acteur staff, `occurredAt` donné par l'horloge backend, et un `summary` figé, par exemple « 12,40 € HT l'unité sur <sku> pour <société>, du … au … » ;
2. **le lien vers la mercuriale qu'il complète**, par son id et son libellé figés dans le summary ou dans un champ dédié (question Q2) ;
3. pour le L7c, **l'origine** : « reporté depuis <ancien sku> (mercuriale <id>) » ;
4. un **motif obligatoire** à l'écran, par exemple « accord par e-mail du 28/10 ». Le motif sert de pièce justificative tant qu'il n'existe pas d'acte client ;
5. la trace de prix figée sur chaque commande, qui existe déjà et n'est pas à refaire.

## 4. Lots (un lot = un commit)

- **T1 `feat(pricing)` domaine.** Fabrique `MercurialeAddendum` (ou `PriceRule` construite par un helper) qui fixe `stage = mercuriale`, `nature = replace`, `audience = company` et `stacksOverMercuriale = false`. Le refus « sku déjà dans la grille vivante sur la fenêtre » devient une erreur nommée. Tests unitaires :
  - `resolvePrice` à une date avant, pendant et après la fenêtre de l'ajout ;
  - la mercuriale sans le sku plus l'ajout donne le prix de l'ajout, qui scelle ;
  - une promotion sans `stacksOverMercuriale` est rejetée comme `sealed`.
- **T2 `feat(pricing)` commande `add-dated-mercuriale-line`.** Handler et commande, un fichier par handler (porte `lint:handler-per-file`). Il contrôle :
  - l'existence de la société ;
  - la mise en vente ;
  - la période qui a facturé ;
  - les recouvrements par la règle existante.

  Il écrit ensuite au journal. Tests d'intégration : refus en cas de doublon de grille, refus en rétroactif sur une période facturée, `liveAsOf` puis résolution d'une commande datée.

- **T3 `feat(pricing)` HTTP admin.** `POST admin/companies/:id/pricing/mercuriale-additions`, avec contrat partagé et motif obligatoire. Test e2e.
- **T4 `feat(pricing)` lecture.** La vue de la mercuriale posée (`posed-mercuriale-view.ts`) et la liste par référence (`prisma-sale-reference-decisions.reader.ts`) affichent aussi les ajouts. Sinon la liste du L7c rate les tarifs ajoutés. Tests du reader.
- **T5 `feat(catalogue)` L7c.** Geste « reporter sur la nouvelle référence » depuis la liste, avec la garde `detached_from_sku`, `fold-inline-confirm`, et une décision par famille. Pour la mercuriale, on appelle T2. Test e2e : détacher, reporter, puis une commande du client au prix négocié sur le nouveau sku.
- **T6 `feat(admin)` écran.** Bouton « Ajouter un tarif daté » sur la fiche tarifaire de la société.
- **T7 `docs(pricing)`.** Section « ajout daté » dans `documentation/pricing/mercuriales/comprendre-une-mercuriale.md`, et mise à jour du L7c.

## 5. Questions à Hugo

1. **Q1.** Faut-il refuser un ajout daté sur un sku que la grille vivante porte déjà, et réserver le changement de prix à la renégociation du document ? Recommandation : **oui**. Ça évite deux prix négociés pour un même article et un arbitrage implicite.
2. **Q2.** Faut-il relier l'ajout à sa mercuriale par un **champ** (une colonne `addendumOf` sur `price_rules`, migration) plutôt que dans le seul summary ? Recommandation : **oui, un champ**. La vue de la mercuriale et la clôture, qui pourrait clore ses ajouts avec elle, en ont besoin. Une phrase ne suffit pas.
3. **Q3.** Quand on clôt la mercuriale, faut-il clore aussi ses ajouts (bornés à la même date) ? Recommandation : **oui**. Un ajout qui survivrait à son document serait un tarif négocié sans document.

## 6. Non vérifié

- Les critères exacts de `winnerOf` et de `specificity.ts` entre une règle `variant:` et la règle `product:` dérivée de la grille.
- La façon dont `pricingContextFor` remplit `variantSku` pour une déclinaison. Le code de `asRuleFor` affirme « même sku » (`company-mercuriale.ts:262-264`), mais je ne l'ai pas vérifié.
- Les contraintes d'exclusion SQL de `price_rules` pour l'audience company à l'étage mercuriale (migrations non ouvertes).
- L'écran client et la trace affichée.
- Le contenu de `posed-mercuriale-view.ts`.
- L'existence d'un PDF ou d'un e-mail de mercuriale hors des fichiers dont le nom contient mail, pdf ou notif.
- Le schéma de `PriceRule` au-delà des lignes citées.
- Les données en base.

### Fichiers critiques

- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/domain/entities/company-mercuriale.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/domain/resolve-price.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/application/commands/pose-company-mercuriale.handler.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/infrastructure/prisma-sale-reference-decisions.reader.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/prisma/schema/public/pricing.prisma

## 7. Contradiction (vitruve, 2026-10-29) — le § 1 est à reprendre

**BLOQUANTS**

1. **Le plan revient sur une décision déjà migrée.** `20260908160000_mercuriale_objet`
   a repris toutes les règles `stage='mercuriale' AND audience_type='company'`
   dans `company_mercuriales` et les a archivées (« N règles indépendantes que
   rien ne reliait », risque de « 400 au paiement ») ; un gabarit pose
   aujourd'hui un `CompanyMercuriale.pose(...)` (`apply-price-template.handler.ts`
   ~68-100), et le contrat interdit de saisir une règle mercuriale
   (`authoredPriceStageSchema = ["promotion","geste"]`, `packages/contracts/src/pricing.ts:78`).
   Le commentaire de `pricing.prisma` ~345 qui dit le contraire est périmé.
2. **Les sous-comptes** : la mercuriale vise `pricingCompanyId` (le principal
   que suit un site), une règle `company` est jugée sur `companyId` — l'ajout
   ne s'appliquerait pas aux sites.
3. **Le doublon n'est gardé que dans un sens** : poser une mercuriale ou un
   gabarit portant la même référence pendant qu'un ajout court donne deux
   règles à égalité → `AmbiguousPriceRulesError`, commande en 400.

**SÉRIEUX** : `variant:` battrait en silence une ligne de grille (`SCOPE_RANK`) —
`product:` seulement ; plancher appliqué après (à afficher) ; trois lecteurs
oubliés (comparatif `loaded-pricer.ts` ~300-335, `board-item.ts:132`,
`company-pricing.query.ts:93`) ; clore = borner `validTo`, pas archiver ; motif
obligatoire non tenu par le domaine.

**Décision à prendre par Hugo (T0)** :

- **(a)** revenir à des règles d'étage mercuriale, en répondant aux motifs de
  `20260908160000` ;
- **(b)** faire de l'ajout un **avenant daté de la mercuriale** : une nouvelle
  version du document, avec sa fenêtre, qui hérite de `pricingCompanyId`, de la
  clôture et du refus de doublon déjà tenus par la mercuriale.

Recommandation de Claude : **(b)**, qui garde l'objet que la maison a choisi le
2026-09-08 et règle d'un coup les trois bloquants.

# Un tarif daté sur une référence : l'avenant daté de la mercuriale

> 📐 **Révision du 2026-10-29.** Plan seulement, aucun code. Tout ce qui est affirmé ici a été ouvert le 2026-10-29. Ce qui ne l'a pas été figure au § 9.
>
> **Pourquoi cette révision.** La première version (même date) faisait de l'ajout une `PriceRule` à l'étage mercuriale, d'audience `company`. La contradiction de vitruve (§ 10, gardée telle quelle) a relevé trois bloquants :
>
> - cette forme revient sur la migration `20260908160000_mercuriale_objet` ;
> - un sous-compte n'aurait pas le prix de l'ajout ;
> - le doublon n'était gardé que dans un sens.
>
> **Décision de Hugo (2026-10-29) : voie (b).** Un tarif ajouté sur une référence est un **avenant au document `CompanyMercuriale`**. Les §§ 1 à 8 sont réécrits en conséquence. Les règles à part sont abandonnées.

## 0. Ce que dit le code aujourd'hui

- **La mercuriale est un objet, et elle se prend en bloc.** Le commentaire de classe dit qu'elle a d'abord été N règles, puis qu'elle est devenue un agrégat : « on la pose entière, on la clôt entière », sans aucune ligne qui aurait son propre cycle de vie (`apps/lfd-api/src/b2b/pricing/domain/entities/company-mercuriale.ts:59-96`). Seul le libellé se modifie (`rename`, `:172-175`).
- **La grille est un jsonb écrit entier.** La table fille a été refusée exprès, pour qu'on ne puisse pas « insérer une ligne sans les autres » (`apps/lfd-api/prisma/schema/public/pricing.prisma`, commentaire de `lines`, autour de la ligne 303). La fenêtre est **une seule** pour tout le document (`valid_from` et `valid_to`). Le cycle de vie passe par `paused_*` et `archived_*`.
- **La migration `20260908160000_mercuriale_objet`** fait trois choses :
  - elle crée `company_mercuriales` ;
  - elle pose la contrainte `company_mercuriales_no_overlap`, `EXCLUDE USING gist (company_id WITH =, tstzrange(valid_from, valid_to, '[)') WITH &&) WHERE archived_at IS NULL`, soit une seule mercuriale en cours par client ;
  - elle reprend les règles `stage='mercuriale' AND audience_type='company'`, en expliquant pourquoi : des règles laissées en place seraient « deux décisions au même étage qu'aucune contrainte ne voit ensemble : un 400 au paiement ».
- **La pose** se fait dans cet ordre (`application/commands/pose-company-mercuriale.handler.ts:58-127`) :
  - `assertCompanyExists` ;
  - `assertOnSale(..., "pro")` ;
  - refus `RunningMercurialeError` si une mercuriale non close chevauche ;
  - refus `PricedPeriodIsSealedError` si une mercuriale close **qui a facturé** chevauche (`:91-94`) ;
  - puis `save` avec un acte au journal : `kind: "posed"`, `reason: null` (« l'écran n'en demande pas »), `summary: describeMercuriale(...)`.
- **La clôture** (`close-company-mercuriale.handler.ts:32-50`, domaine `company-mercuriale.ts:202-215`) archive le document **et** borne `validTo` par `closingWindowAt`, ce qui corrige R17 du 2026-09-09. Le motif (`payload.reason`) est transmis, mais le domaine l'accepte à `null` (`close(by, at, reason: string | null)`).
- **La lecture comme règle.** `asRuleFor` fait les choses suivantes (`company-mercuriale.ts:258-297`) :
  - il compare `context.pricingCompanyId` à `companyId`, ce qui fait payer au sous-compte la mercuriale du principal ;
  - il cherche la ligne par `context.productSku` et choisit le plus haut palier atteint ;
  - il rend **une seule** règle avec `id = mercuriale.id`, la fenêtre **du document** et `label` du document.

  `missesTierFor` (`:311-323`) répète la même recherche de ligne.

- **Les lectures datées** (`infrastructure/prisma-company-mercuriale.reader.ts`) :
  - `liveFor` (`:28-42`) lit les mercuriales non archivées dont la fenêtre couvre `at` ;
  - `liveAsOf` (`:62-80`) applique `unarchivedAt(at)` et la fenêtre, puis trie : l'ouverte avant la close, puis la plus récente ;
  - `listFor` (`:82-90`) exclut les closes ;
  - `liveEverywhere` (`:92`) exclut aussi les mercuriales en pause.

  Le chargeur choisit entre `liveAsOf` (époque `replay`) et `liveFor`, toujours sur `parties.pricingCompanyId` (`application/pricing-materials.loader.ts:146-149`).

- **Les lecteurs de la mercuriale hors du chargeur :**
  - `LoadedPricer.mercurialeAlone`, pour le comparatif de marché (`domain/loaded-pricer.ts:298-336`, appelé par `application/queries/mercuriale-benchmark.query.ts:89` sur `liveEverywhere`, `:48`) ;
  - `board-item.ts:132` ;
  - `company-pricing.query.ts:88-93` (`listFor` plus `liveFor(parties.pricingCompanyId, at)`) ;
  - `volume-tier-prices.ts:161` ;
  - `resolve-price.ts:269` (`missesTierFor`) ;
  - `pricing-materials.ts:108` (`mercurialeFor`).
- **La vue** `application/posed-mercuriale-view.ts` est une projection pure. `statusOf` (`:39-54`) se lit sur la fenêtre du document, et `linesOf` (`:65-79`) donne une ligne par palier de `mercuriale.lines`.
- **La liste du L7c.** `infrastructure/prisma-sale-reference-decisions.reader.ts:47-61` lit `companyMercuriale` avec `lines array_contains [{ sku }]`.
- **La porte `lint:dated-decisions`** (`dev-toolbox/gates/dated-decisions.mjs`) contrôle chaque champ de `PricingMaterials`. Le fichier qui déclare le type du champ doit prononcer `validFrom`, et `EXEMPT` est vide. Le champ `mercuriale: CompanyMercuriale | null` est déclaré dans `pricing-materials.ts:65,74`.
- **La facture du mois** ne paraît pas re-résoudre le prix. Les mappers comptables relisent `unitPriceMillicents` sur les lignes de commande (`b2b/accounting/infrastructure/frozen-invoice-order.mapper.ts:37,61` et `billable-invoice-order.mapper.ts:67,152`), et une recherche de `pricer`/`resolvePrice` dans `b2b/accounting` ne renvoie rien. Il faut le confirmer (§ 9).

## 1. Le modèle : une table d'avenants rattachée au document

**Choix : une table `company_mercuriale_amendments`**, enfant de `company_mercuriales`. On écarte les « versions » du document.

Chaque avenant porte :

- `id` et `mercuriale_id`, une clé étrangère vers le document ;
- `lines` en jsonb `[{ sku, tiers }]`, **écrit entier**, avec les mêmes invariants que la grille via `normalizeGrid` (`company-mercuriale.ts:122`) ;
- `valid_from` (Timestamptz, borne incluse) et `valid_to` (exclue, `null` = jusqu'à la fin du document) ;
- `reason TEXT NOT NULL`, le motif ;
- `origin` en jsonb nullable, par exemple `{ kind: "detached", fromSku, fromMercurialeId }` pour le L7c ;
- `created_by` et `created_at` ;
- `archived_at`, `archived_by` et `archive_reason`, utilisés seulement par la clôture du document (§ 3).

**Pourquoi une table et pas des versions du document.** Une version, c'est clore puis reposer une copie entière de la grille.

- **L'identité se perd.** Le journal (`subjectId`) et la règle rendue (`id = mercuriale.id`) changeraient à chaque ajout, alors que le client a **un** accord.
- **L'accord disparaît des listes.** Clore archive, et `listFor` cache les closes (`reader.ts:84-86`). Le dossier montrerait la copie, pas l'accord d'origine.
- **La copie peut mentir.** Recopier N lignes pour en ajouter une donne N occasions de se tromper sur un prix que personne ne voulait changer.
- **La table préserve ce qu'on veut garder.** L'invariant « écrit entier » tient, puisque chaque avenant est un bloc immuable avec sa grille. Le document n'est jamais réécrit : aucun `UPDATE` de `lines`, donc aucune facture passée dont l'explication change.

**Ce qu'on ne fait pas.** On ne met pas de fenêtre par ligne dans le jsonb du document. La porte ne la verrait pas, et le document serait réécrit.

**L'avenant ne retire rien.** C'est la recommandation, voir Q1. Retirer un article qui a facturé revient à clore et reposer, comme aujourd'hui (`company-mercuriale.ts:165-169`).

**Invariants du domaine.** `CompanyMercuriale.amend(id, draft, by, now)` rend un nouvel état. Les avenants sont chargés **dans** l'agrégat (`state.amendments`). Le domaine refuse avec des erreurs nommées :

1. **Un document clos.** On réutilise `ArchivedMercurialeIsSealedError`.
2. **Un motif vide ou blanc**, avec `MissingAmendmentReasonError`. Le motif est un invariant du domaine, pas seulement de l'écran, ce qui répond au « SÉRIEUX » de vitruve.
3. **Une fenêtre inversée** (`ReversedValidityWindowError`) ou **qui déborde du document.** On exige `validFrom >= document.validFrom` et `validTo <= document.validTo` quand celui-ci est borné. Un `validTo` à `null` se lit comme « jusqu'à la fin du document ».
4. **Un `validFrom` antérieur à `now`.** C'est l'horloge du handler, pas un pré-contrôle « a facturé ». Raison : le document a peut-être déjà facturé sur cette période, et un ajout rétroactif changerait ce qu'une relecture datée rend pour une commande déjà payée (voir le test T2-c).
5. **Un doublon**, voir le § 2.

## 2. Le refus de doublon, tenu des deux côtés

Une référence ne peut pas être à la fois :

- dans `document.lines` ;
- dans un autre avenant non archivé dont la fenêtre chevauche celle du nouvel avenant ;
- deux fois dans l'avenant lui-même, refus déjà fait par `normalizeGrid`.

L'erreur s'appelle `SkuAlreadyNegotiatedError(sku, where)`, et sa phrase dit « déjà dans la grille » ou « déjà ajouté par l'avenant du JJ/MM ».

**L'autre sens, celui qui manquait.** Avec le modèle à règles, poser une mercuriale ou un gabarit pendant qu'un ajout courait donnait une égalité. Ici, le cas disparaît par construction. Un avenant appartient à **son** document, et un second document chez le même client est déjà refusé par `RunningMercurialeError`, par la contrainte d'exclusion, et par le gabarit qui passe par `CompanyMercuriale.pose` (à reconfirmer, § 9).

**La course entre deux commerciaux.** L'agrégat voit les avenants qu'il a chargés, mais deux écritures simultanées peuvent passer. Le dépôt prend un verrou sur la ligne du document (`SELECT … FOR UPDATE` sur `company_mercuriales`) dans la transaction qui insère l'avenant. On n'ajoute pas de contrainte d'exclusion SQL, parce que les skus vivent dans du jsonb. **Le verrou reste à valider** au lot T2 : un test d'intégration doit lancer deux écritures concurrentes.

**Une seule règle par article.** Grâce au refus de doublon, `asRuleFor` trouve au plus **une** ligne pour un sku à un instant : celle du document ou celle d'un seul avenant. L'invariant « au plus UNE règle » (`company-mercuriale.ts:236-241`) tient donc toujours.

## 3. Comment document et avenants se composent à une date

**`asRuleFor(context)`.** La recherche de ligne change :

1. on garde le contrôle actuel sur `pricingCompanyId` (`:259`). C'est ce qui fait hériter les sous-comptes ;
2. on cherche d'abord dans `document.lines` ; si la ligne y est, rien ne change ;
3. sinon, on cherche parmi les avenants non archivés **à `context.at`**. Un avenant archivé après `at` compte encore en relecture, avec la même convention que `unarchivedAt`. Un avenant qui porte le sku et dont la fenêtre couvre `context.at` est retenu ;
4. la règle rendue a :
   - `stage: "mercuriale"`, `scope: product:<sku>` (jamais `variant:`, ce qui répond au point `SCOPE_RANK` de vitruve), `nature: "replace"` et `stacksOverMercuriale: false` ;
   - **la fenêtre de l'avenant**, coupée par celle du document ;
   - `suspendedFrom` du document : une pause du document suspend ses avenants ;
   - `id = amendment.id`, pour que la trace dise de quelle pièce vient le prix (à confirmer selon ce que la trace fige, § 9) ;
   - `label` = « <libellé du document> — avenant du JJ/MM ».

`missesTierFor` suit la même recherche, document puis avenants. Il faut extraire **une** fonction privée `lineFor(context)` partagée par les deux, pour qu'ils ne divergent pas.

**`context.at`.** `PricingContext` porte bien `at`, puisque `mercurialeAlone` le renseigne (`loaded-pricer.ts:316`). On n'ajoute aucun paramètre.

**`liveFor`/`liveAsOf`.** Ils chargent le document **avec** ses avenants (`include`). Les avenants archivés sont filtrés au même instant que le document : non archivés pour `liveFor`, `unarchivedAt(at)` pour `liveAsOf`. On ne filtre **pas** les avenants par leur propre fenêtre dans la requête. C'est `asRuleFor` qui juge à `context.at`, comme le reader le fait déjà pour la pause (`reader.ts:17-20`). Raison : la projection résout plusieurs instants sur un seul chargement. `listFor` et `liveEverywhere` chargent aussi les avenants. Il faut adapter `mercurialeFromRow` (`infrastructure/mercuriale-rows.ts`).

**La porte.** Le type du champ reste `CompanyMercuriale`, déclaré dans un fichier qui prononce `validFrom`, donc la porte passe sans modification. Elle ne regarde pas les membres imbriqués. Pour que l'avenant ne soit pas daté « par accident », on déclare `MercurialeAmendment` (avec `validFrom`) **dans** `company-mercuriale.ts`. On peut aussi demander à la porte de suivre les types imbriqués, ce qui est hors de ce plan.

**La clôture du document.** `close` archive aussi tous les avenants non archivés, au même instant et avec le même motif. On fait la même chose pour la fenêtre : on borne `validTo` de chaque avenant par `closingWindowAt`, pour que la relecture datée reste juste (R17). Clore un avenant **seul** est hors périmètre (Q1).

## 4. La trace au journal

`save` et `update` du dépôt reçoivent déjà un acte. L'avenant en écrit un :

- `subjectType: "mercuriale"` et `subjectId` = id du document, pour que le journal de l'accord reste un seul fil ;
- `kind: "amended"`, une nouvelle valeur (à ajouter à l'énumération du journal, non ouverte, § 9) ;
- `actor`, et `at` = `validFrom` de l'avenant, comme la pose qui écrit `at: validFrom` (`pose-…handler.ts:119`) ;
- `reason` = le motif, **non nul** ;
- `summary` figé, par exemple « + <sku> 12,40 € HT dès 1 u., du 01/11 au 31/12 » ou « + <sku> reporté depuis <ancien sku> ». La forme s'aligne sur `describeMercuriale` ;
- `subjectLabel` = libellé du document.

Le `summary` de `close` (`close-…handler.ts:47`) doit compter les lignes d'avenant, sinon « N articles » ment. Il en va de même pour la valeur de retour `lines.length`, à `:50`.

## 5. Ce que voit le client et le staff

- **Le client (commande, trace de prix).** Il voit un prix d'étage mercuriale qui ferme la chaîne, avec le libellé « <document> — avenant du JJ/MM ». Le plancher s'applique après, comme pour toute ligne de mercuriale. On ne change rien à l'écran client. **Il n'a pas été ouvert** (§ 9).
- **Le sous-compte** a le même prix, puisqu'il lit la mercuriale du principal (`asRuleFor:259`, chargeur `:148`).
- **Le dossier staff.** `posed-mercuriale-view.ts` fait deux choses :
  - `linesOf` ajoute les lignes d'avenant avec `amendmentId`, `validFrom`, `validTo` et `reason`, et un statut par ligne calculé par la même logique que `statusOf` ;
  - le statut du document ne change pas.

  Le contrat `PosedMercurialeLineView` gagne des champs optionnels dans `@lfd/contracts`.

- **Les lecteurs à vérifier un par un :** `board-item.ts:132` et `volume-tier-prices.ts:161` passent par `asRuleFor` et héritent donc des avenants si le contexte porte `at`. `mercurialeAlone` (`loaded-pricer.ts:298-336`) passe aussi par `asRuleFor` et hérite, **mais** `mercuriale-benchmark.query.ts:51` liste les skus à partir de `mercuriale.lines`. Il faut y ajouter les skus des avenants en vigueur. `company-pricing.query.ts:93` hérite via `liveFor`.
- **Le L7c.** `prisma-sale-reference-decisions.reader.ts:47-61` doit aussi trouver les documents dont un **avenant** non archivé contient le sku : `OR` sur `amendments: { some: { lines array_contains … } }`.

## 6. Le geste L7c : reporter depuis `GET admin/pricing/sale-references/:sku/decisions`

Pour chaque entrée `kind: "mercuriale"` de l'ancien sku, on propose « reporter sur <nouveau sku> » :

- **Garde** : la nouvelle référence porte `detached_from_sku` = l'ancienne, et elle est en vente (`assertOnSale`, comme dans `pose-…handler.ts:62-66`).
- **Paliers** : on les copie depuis la ligne de l'ancien sku, prise dans le document ou dans l'avenant qui la porte.
- **Fenêtre** : `validFrom` = max(maintenant, date du détachement), `validTo` = `null`, c'est-à-dire la fin du document.
- **Motif** : prérempli « report de la déclinaison détachée <ancien sku> », modifiable, non vide. `origin` est rempli.
- **Confirmation** : `fold-inline-confirm`, puis un appel à la commande de T2 par document.

Les autres familles (règles, planchers, barèmes, engagements) gardent leur geste propre, comme prévu au L7c (`documentation/catalogue/plan-pro-voit-les-declinaisons.md:286-295`). On ne retire pas la ligne de l'ancien sku, puisque la référence n'est plus en vente.

## 7. Lots (un lot = un commit)

**T1 `feat(pricing)` domaine.** `MercurialeAmendment`, `amend`, `lineFor` partagé par `asRuleFor` et `missesTierFor`, cascade dans `close`, et les erreurs nommées.

Tests unitaires :

- un sku hors grille plus un avenant donne le prix de l'avenant, qui **scelle** (une promotion sans `stacksOverMercuriale` est rejetée) ;
- `resolvePrice` avant, pendant et après la fenêtre de l'avenant ;
- refus : doublon avec la grille, doublon avec un avenant qui chevauche, motif vide, fenêtre hors document, `validFrom < now`, document clos ;
- deux avenants sur le même sku à des fenêtres disjointes sont acceptés ;
- clore le document borne et archive ses avenants ;
- **sous-compte au prix de l'avenant** : le contexte a `companyId` = site et `pricingCompanyId` = principal, l'avenant porte le prix, la règle vise le site ;
- un autre compte de tarif ne rend rien ;
- `missesTierFor` avec un avenant à paliers non atteints.

**T2 `feat(pricing)` persistance et commande `amend-company-mercuriale`.** Un handler par fichier (`lint:handler-per-file`). On ajoute :

- la migration `company_mercuriale_amendments` (FK, `reason NOT NULL`, index `(mercuriale_id, archived_at)`) et le modèle Prisma ;
- `mercurialeFromRow` qui inclut les avenants, et `liveFor`/`liveAsOf`/`listFor`/`liveEverywhere` qui les chargent ;
- le verrou `FOR UPDATE` ;
- l'acte `amended`.

Tests d'intégration :

- (a) refus de doublon par écrit concurrent ;
- (b) le gabarit et la pose pendant un avenant restent refusés par `RunningMercurialeError` ;
- (c) **relecture datée d'une commande passée avant l'avenant** : `liveAsOf(principal, t0)` avec t0 < `validFrom` de l'avenant, et la résolution rend le prix canonique (ou celui d'avant) pour le nouveau sku, inchangé après la pose de l'avenant ;
- (d) `liveAsOf` après la clôture du document retrouve l'avenant pour un instant antérieur à la clôture.

**T3 `feat(pricing)` HTTP admin.** `POST admin/companies/:id/pricing/mercuriales/:mercurialeId/amendments`, contrat partagé dans `@lfd/contracts`, motif obligatoire au schéma. Test e2e : poser, ajouter un avenant, puis une commande d'un **sous-compte** est facturée au prix de l'avenant.

**T4 `feat(pricing)` lecteurs.** On modifie :

- `posed-mercuriale-view.ts` et son contrat ;
- `prisma-sale-reference-decisions.reader.ts` ;
- `mercuriale-benchmark.query.ts:51` ;
- le `summary` et le compte de `close`.

Tests du reader et de la vue.

**T5 `feat(catalogue)` L7c.** Le geste « reporter », avec la garde `detached_from_sku`. Test e2e : détacher, reporter, puis une commande du client (et d'un sous-compte) au prix négocié sur le nouveau sku.

**T6 `feat(admin)` écran.** « Ajouter un tarif à cette mercuriale » sur la fiche tarifaire, avec le champ motif obligatoire et la liste des avenants sous la grille.

**T7 `docs(pricing)`.** Section « avenant » dans `documentation/pricing/mercuriales/comprendre-une-mercuriale.md`. On corrige au passage le commentaire périmé de `PriceTemplate` dans `pricing.prisma` (vers la ligne 345), qui parle de « N règles de l'étage mercuriale », et on met à jour le L7c.

## 8. Questions à Hugo (fermées)

1. **Q1.** L'avenant **ajoute seulement** : il ne retire pas d'article et ne change pas un prix déjà dans la grille, et il ne se clôt pas seul (seul le document se clôt). Recommandation : **oui**. Changer ou retirer un prix négocié reste « clore et reposer ».
2. **Q2.** Faut-il refuser un avenant rétroactif (`validFrom < maintenant`), même sur une période qui n'a pas facturé ? Recommandation : **oui** en V1. C'est plus simple que le pré-contrôle « a facturé » de la pose, et un oubli se rattrape en posant l'avenant aujourd'hui.
3. **Q3.** Quand un document est **en pause**, ses avenants sont-ils suspendus avec lui ? Recommandation : **oui**, l'avenant hérite de `suspendedFrom` du document.

## 9. Non vérifié

- Ce que la trace figée d'une ligne de commande garde de la règle gagnante (id, label). Le choix `id = amendment.id` en dépend.
- L'énumération des `kind` du journal (`PricingEvent`) et l'emplacement de `describeMercuriale` (`company-mercuriale-support.ts` n'a pas été ouvert).
- `apply-price-template.handler.ts` ~68-100 (passe-t-il bien par `CompanyMercuriale.pose` et le contrôle `runningFor` ?) : c'est vitruve qui l'affirme, je ne l'ai pas rouvert.
- La facture du mois. J'ai seulement vu que les mappers comptables lisent `unitPriceMillicents` sur les lignes. Je n'ai pas vérifié qu'aucun chemin de facturation ne re-résout en `replay`.
- `unarchivedAt` (`infrastructure/archived-at.js`), `closingWindowAt` (`rule-lifecycle.ts`) et `standingAt` du lecteur L7c.
- L'écran client, le dossier staff (frontend `fiche-client/tarifs/mercuriale-rows.ts`) et le contrat `PosedMercurialeLineView`.
- Le comportement du verrou `FOR UPDATE` avec le dépôt Prisma actuel (transactions interactives ?).
- Les données en base.

## 10. Contradiction (vitruve, 2026-10-29), à l'origine de cette révision

_(Texte d'origine conservé.)_

**BLOQUANTS**

1. **Le plan revient sur une décision déjà migrée.** `20260908160000_mercuriale_objet` a repris toutes les règles `stage='mercuriale' AND audience_type='company'` dans `company_mercuriales` et les a archivées (« N règles indépendantes que rien ne reliait », risque de « 400 au paiement »). Un gabarit pose aujourd'hui un `CompanyMercuriale.pose(...)` (`apply-price-template.handler.ts` ~68-100), et le contrat interdit de saisir une règle mercuriale (`authoredPriceStageSchema = ["promotion","geste"]`, `packages/contracts/src/pricing.ts:78`). Le commentaire de `pricing.prisma` ~345 qui dit le contraire est périmé.
2. **Les sous-comptes.** La mercuriale vise `pricingCompanyId` (le principal que suit un site), alors qu'une règle `company` est jugée sur `companyId` : l'ajout ne s'appliquerait pas aux sites.
3. **Le doublon n'est gardé que dans un sens.** Poser une mercuriale ou un gabarit portant la même référence pendant qu'un ajout court donne deux règles à égalité, donc `AmbiguousPriceRulesError` et une commande en 400.

**SÉRIEUX** :

- `variant:` battrait en silence une ligne de grille (`SCOPE_RANK`), il faut `product:` seulement ;
- le plancher s'applique après (à afficher) ;
- trois lecteurs oubliés : comparatif `loaded-pricer.ts` ~300-335, `board-item.ts:132`, `company-pricing.query.ts:93` ;
- clore = borner `validTo`, pas archiver ;
- le motif obligatoire n'est pas tenu par le domaine.

**Réponse de cette révision.**

- Bloquant 1 : on garde l'objet (§ 1).
- Bloquant 2 : on hérite de `pricingCompanyId` (§ 3, test T1).
- Bloquant 3 : un avenant appartient à son document, et la pose concurrente est refusée par `RunningMercurialeError` (§ 2).
- `product:` seulement (§ 3).
- Le plancher est affiché (§ 5).
- Les trois lecteurs sont traités (§ 5, T4).
- La clôture borne **et** archive (§ 3).
- Le motif est un invariant du domaine (§ 1, point 2).

**Décision de Hugo (2026-10-29) : (b), l'avenant daté de la mercuriale.**

### Fichiers critiques

- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/domain/entities/company-mercuriale.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/infrastructure/prisma-company-mercuriale.reader.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/prisma/schema/public/pricing.prisma
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/application/posed-mercuriale-view.ts
- /Users/hugo/WebstormProjects/LaFolieDouce/apps/lfd-api/src/b2b/pricing/infrastructure/prisma-sale-reference-decisions.reader.ts

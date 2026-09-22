# Le référentiel — Architecture Decision Records

> **Décision → raison → conséquences.** Une entrée par choix structurant **propre
> au référentiel produit**.
>
> 🔴 **Dix entrées ont quitté ce fichier le 2026-09-13** — monolithe modulaire,
> déployable, stack Angular/Nest, Prisma, Postgres, hébergement, Turborepo, ESM
> et flags TypeScript, Auth0. Elles engagent **tout le monorepo** et se lisaient
> ici comme des choix du PIM : elles vivent désormais dans
> [`../adr.md`](../adr.md). Les numéros n'ont pas bougé, pour que les citations
> existantes restent vraies — les deux fichiers se partagent une numérotation,
> 01–06, 08–10 et 12 là-bas, 07, 11 et 13–17 ici.
>
> Chaque entrée restante a été **confrontée au code le 2026-09-13**. Ce qui
> avait vieilli porte un bandeau ⚠️ plutôt qu'une réécriture silencieuse : une
> décision qu'on a cessé d'appliquer est une information, et l'effacer ferait
> disparaître la question qui se reposera.

## ADR-07 — Allergènes stockés en GS1, projetés en INCO

**Décision** : stockage canonique **GS1 `AllergenTypeCode`**, projection vers **INCO** (14 UE) à
l'affichage. Mapping **n:1** maintenu (donnée de référence versionnée), service `AllergenMapping`.
**Raison** : GS1 = sur-ensemble international interopérable (B2B/GDSN) ; INCO = obligation légale UE.
Stocker le plus riche, projeter vers le bas (l'inverse serait avec perte).
**Conséquences** : détail dans
[`data-model/05-allergenes-gs1-inco.md`](./data-model/05-allergenes-gs1-inco.md).
Le bloc est en place : [`apps/lfd-api/src/pim/allergens`](../../apps/lfd-api/src/pim/allergens).

✅ **Le « à peupler » est fait** (vérifié le 2026-09-13), et autrement que prévu :
les codes ne sont plus une liste en dur à compléter depuis `ref.gs1.org`, ils
sont devenus un **référentiel administrable** — création, archivage et
réorganisation des catégories et des entrées ont chacun leur cas d'usage. La
projection vers INCO est une fonction pure (`allergen-projection.ts`), et
`toGdsn` existe bien.

⚠️ Deux noms de la v1 ne désignent rien : il n'existe **pas** de service
`AllergenMapping`. La projection est portée par `IncoProjector`, injecté dans les
canaux — c'est-à-dire passé aux fonctions pures plutôt que lu par elles, ce que
`projection.ts` promet en tête.

---

## ADR-11 — Catalogue orienté comportement ; event store **préparé, pas activé**

> **Révisé le 2026-07-21** — la v1 décidait « event-sourced dès le départ ». Cette version-là est
> rétrogradée à l'issue d'une revue adversariale du modèle. Le raisonnement d'origine est conservé
> plus bas.

**Décision** : le catalogue est modélisé **par ses comportements** (commandes → faits nommés), mais
les tables sont **écrites directement** par les handlers. **Pas** de table `events`, **pas** de
projecteurs, **pas** d'upcasting — pour l'instant. Trois règles rendent le passage ultérieur à
l'event store **non destructif** (détail dans
[`data-model/00-langage-et-comportement.md`](../pim/data-model/00-langage-et-comportement.md#5--les-trois-règles-irréversibles)) :

- **R1 — ids assignés par la commande** (UUID v7 applicatif). Jamais de séquence ni de
  `gen_random_uuid()` en base : un replay régénérerait des ids différents, alors que la caisse,
  Shopify et l'historique de commandes pointent dessus. **Seule règle réellement irrattrapable.**
- **R2 — toute mutation porte un nom métier** (`RenameProduct`, `DiscontinueVariant`…). Pas
  d'`update(partial)` générique : une intention non nommée ne peut pas être rétro-nommée.
- **R3 — aucun `DELETE` physique**, on archive.

**Raison du recul** : la justification v1 était **esthétique et fausse**. Elle promettait « zéro
`created_at`/`updated_at` » — mais une table de projection a de toute façon besoin de
`last_event_version` et `projected_at` : la métadonnée revenait, juste renommée. Surtout, le rapport
coût/bénéfice ne tient pas : projecteurs + versioning + upcasting + hard-gate de replay **à vie**,
pour un catalogue de boulangerie édité par trois personnes, sans contention ni invariant temporel
riche. L'ES brille sur les domaines à comportement dense (contrat, compte, réservation) ; ici on a du
CRUD enrichi. Précédent interne : sur **SH3PHERD**, l'event store est arrivé en **couche 3 phase C**,
_après_ stabilisation du modèle — pas au jour 1.

**Ce qui remplace la promesse v1** : `created_at` / `updated_at` / `updated_by` existent, en colonnes
**système hors-domaine** — jamais lues par une règle métier, jamais exposées en DTO. Le jour où
l'event store arrive, elles deviennent redondantes et disparaissent d'un bloc.

**Déclencheur de révision** (quand activer l'ES) : premier besoin réel d'**as-of** (« quel était le
prix affiché le 24/12 ? »), ou obligation d'audit externe, ou un domaine à comportement dense
(production, commandes) — pas le catalogue.

**Conséquences** :

- **D6 est clos** : les frontières d'agrégat sont tranchées dans
  [`00-langage-et-comportement.md`](../pim/data-model/00-langage-et-comportement.md#2--agrégats--la-décision-ex-d6)
  — `Product` (racine, possède déclinaisons + fiches réglementaires), `Category`, `Collection`,
  `MediaAsset`.
- Le schéma Prisma n'est plus bloqué.
- La liste des commandes et des faits est écrite **maintenant**, et fait autorité même sans event
  store : c'est elle qui définit la surface d'écriture.

## ADR-13 — Composition par tables satellites, canaux au bord

**Décision** : trois natures de table, jamais mélangées — **socle** (identité), **couche canonique**
(ce que le produit _est_, ex. réglementaire, éditorial), **contexte canal** (ce qu'un système tiers
_en sait_, ex. `shopify_variant_binding`). Toute table satellite utilise le motif _shared primary
key_ (**PK = FK**). Les tables canal sont possédées par leur **adaptateur**, bindent sur la
**déclinaison** (l'unité vendue) via son **`id`**, et ne sont **pas** event-sourçables (état de
synchro re-dérivable).
**Raison** : « étendre par clé étrangère » ne doit pas devenir « le PIM prend la forme de Shopify ».
La FK ne pointe **jamais** du socle vers un canal — test de validation : _si on supprimait le module
Shopify, le catalogue compilerait-il encore ?_
**Conséquences** :

- L'absence de donnée se représente par **absence de ligne**, pas par colonnes `NULL`.
- Le code famille caisse **sort de `Category`** → un binding de canal.
  ⚠️ **Aucune des tables nommées par cette ADR n'existe** : ni
  `helios_category_binding`, ni `helios_variant_binding` (la caisse n'a jamais
  été branchée, et PI est sorti le 2026-09-22), ni `shopify_variant_binding`
  (supprimée le 2026-09-21).

  🔴 Le **motif** reste appliqué, et il a aujourd'hui un seul porteur :
  **`b2b_channel_binding`** (`prisma/schema/pim/channels.prisma`). C'est lui
  qu'il faut lire pour voir la forme — corrigé le 2026-09-22, parce qu'une ADR
  qui nomme trois tables absentes fait chercher un couplage qui n'existe pas.

- Binding mécanique et overrides éditoriaux par canal sont **deux tables séparées** : le premier est
  jetable et re-poussable, le second est une saisie utilisateur à ne jamais écraser.
- `attributes` (jsonb) est soumis à une **règle de promotion** : lu par un adaptateur ou utilisé par
  ≥2 familles ⇒ devient une colonne.
- Détail : [`data-model/04-composition-et-canaux.md`](../pim/data-model/04-composition-et-canaux.md).

## ADR-14 — Couche logistique descopée de la v1

**Décision** : aucune modélisation du **poids, des dimensions, des unités logistiques** (colis,
palette) ni de la **hiérarchie GTIN / GDSN** dans la v1.
**Raison** : ces champs n'étaient présents que par anticipation d'un B2B non spécifié (**D1** ouvert).
Modéliser une hiérarchie d'unités commerciales sans savoir ce qui est réellement vendu en gros, c'est
figer une structure qu'on paiera à chaque migration.
⚠️ **Partiellement dépassée.** Le **poids** est modélisé depuis :
`ProductVariant.weightGrams` existe, il est saisi dans la section « Tarif &
logistique » et il **part sur le fil** vers la plateforme professionnelle
(vérifié le 2026-09-13). Ce qui reste descopé est le reste — dimensions, unités
logistiques (colis, palette), hiérarchie GTIN/GDSN. Le poids est entré par le
besoin réel qu'attendait cette ADR : vendre au format et à la pièce.

**Conséquences** : le **code-barres** n'est pas un attribut du catalogue — il
devait revenir par le **binding caisse** quand D4 serait tranchée. ⚠️ **D4 est
close le 2026-09-22** par le retrait de PI : il n'y a plus de caisse à brancher,
donc plus rien qui ramène le code-barres. S'il redevient un besoin, il repart
d'une page blanche. La projection GDSN reste un
objectif d'`AllergenMapping.toGdsn()` (ADR-07), pas une structure de données.

## ADR-15 — Construire un PIM minimal plutôt qu'en acheter un

**Décision** : développer nous-mêmes le PIM, **volontairement minimal**, plutôt qu'adopter un PIM du
marché (Akeneo CE, Plytix, Sales Layer, Pimcore) ou faire de **Shopify le maître du catalogue**.

**Requalification préalable** — ce qu'on construit n'est pas _un PIM_, c'est une **jonction** : le
référentiel commun qui fait tenir ensemble la caisse (PI Helios), le web (Shopify) et le **labo de
production**. Le catalogue en est la première vertèbre, pas la finalité. Cette distinction n'est pas
rhétorique : elle est le critère d'arbitrage de tout le reste (voir « Test permanent »).

> 🔴 **Deux des trois systèmes de cette phrase sont partis** — Shopify le
> 2026-09-21, PI Helios le 2026-09-22. La jonction qui justifiait de CONSTRUIRE
> plutôt que d'acheter relie aujourd'hui **la plateforme professionnelle et le
> fournil**, et rien d'autre.
>
> Cette ADR portait déjà son propre déclencheur de révision : « testable —
> révision à D4 et D1 ». **D4 vient d'être close**, non par une réponse mais par
> la disparition de la question. Le déclencheur a donc joué, et personne ne l'a
> vu jouer.
>
> ⚠️ **Ce bandeau ne renverse pas la décision, et c'est délibéré.** Le PIM est
> bâti, en service, et le refaire coûterait plus que tout ce qu'on économiserait.
> Mais sa raison écrite ne décrit plus le dépôt : la relire telle quelle donne
> des arguments qui ne portent plus. ➡️ **À reposer par Hugo** : la jonction à
> deux arms justifie-t-elle encore le périmètre qu'on maintient, ou faut-il
> descoper le référentiel vers ce que le seul canal restant consomme ?

**Raison** :

1. **La valeur est dans la jonction, et elle ne s'achète pas.** Aucun éditeur ne vend le point où
   deux de ses concurrents doivent se rejoindre. La consolidation des ventes multi-canal et le plan
   de production du labo n'existent dans aucun catalogue produit du marché.
2. **80 % de l'effort est l'intégration**, et aucun PIM acheté n'en dispense : les adaptateurs PI et
   Shopify seraient à écrire de toute façon. Acheter revient à ajouter un système à administrer pour
   économiser la partie la plus simple du travail.
3. **Le modèle est spécifique et petit.** `kind = daily | made_to_order | resale`, la disponibilité
   comme **capacité de production** (pas un stock), les allergènes en **GS1 canonique projeté INCO**,
   la **déclinaison** comme unité vendue commune caisse/web : aucun PIM générique ne porte ça. On ne
   l'obtiendrait qu'en encodant le métier dans de la **configuration** là où on peut l'encoder dans
   des **types** — c'est-à-dire en renonçant au bénéfice des flags stricts ([ADR-10](../adr.md)) : un attribut
   dynamique est un `any` avec une interface d'admin. Le socle fait **six tables**.
4. **Shopify-comme-maître est intenable** malgré son coût minimal : pas de plan de production, pas de
   champ allergène natif (metafields + travail de thème), et un maître qui ignore l'existence de la
   caisse ne peut pas arbitrer ce qui descend vers elle.

**Ce qui est assumé — le coût réel n'est pas le modèle, c'est le back-office.** Un PIM du marché ne
vend pas un schéma (le nôtre est meilleur, et il a coûté une journée) : il vend quinze ans
d'**interface d'édition** — recherche, édition en masse, import CSV avec rapport d'erreurs,
annulation, complétude par famille, droits. C'est là que partira le temps. Conséquence directe :
**back-office volontairement rustique**, saisie à l'essentiel, aucun clone d'Akeneo.

**Périmètre — ce qu'on ne construira PAS** (la légitimité s'arrête ici) :

- moteur d'**attributs configurables** (familles à attributs dynamiques, types paramétrables) ;
- **workflows** de validation multi-rôles ;
- **DAM** (recadrage, dérivés d'images, versioning d'assets) ;
- **multi-tenant** « au cas où on le vendrait à d'autres boulangeries ».

Chacun est un projet à part entière et **aucun ne sert la jonction**. Le descope de la couche
logistique (ADR-14) est la première application de cette règle ; il en faudra d'autres.

**Test permanent**, à opposer à toute fonctionnalité envisagée :

> _Est-ce que ça sert à faire tenir ensemble la caisse, le web et le labo ?_
> Si non, c'est du PIM générique : à acheter, à emprunter, ou à différer.

Formulé en une ligne : **construire le spécifique, différer le générique, garder le back-office laid.**

**Conditions d'invalidation** (écrites maintenant, pour ne pas être rediscutées de mémoire) :

- **PI se révèle fermé** — ni écriture, ni export de ventes exploitable (D4). La jonction devient
  impossible : il ne reste qu'un PIM, qu'il vaudrait alors mieux acheter.
- **Le B2B se révèle du volume contractuel** avec facturation et logistique (D1). On est dans le
  périmètre d'un ERP, pas d'un PIM maison.
- **Changement d'échelle** : plusieurs points de vente, ou un second client de l'outil. Le
  multi-tenant est explicitement hors périmètre — l'atteindre invaliderait la décision, pas le code.

**Revue** : à la réponse de **D4** et de **D1**. Ces deux réponses suffisent à confirmer ou infirmer
cet ADR — la décision est **testable**, pas une conviction.

## ADR-16 — Un SKU interne unique ; les références canal vivent au bord

**Décision** : le `Sku` est **un seul identifiant, global à notre catalogue**, émis par nous, porté
par la déclinaison (l'unité vendue) — **pas** un identifiant par canal. Il est modélisé en **value
object** du module `catalogue`, jamais en module/entité/endpoint autonome. Ce que chaque système
tiers appelle l'article est une **référence canal**, qui vit dans la table de binding de son
adaptateur (ADR-13).

**Raison** : _Stock Keeping Unit_ désigne la référence **du commerçant** ; un SKU qui change selon
l'interlocuteur cesse d'être le référentiel commun qu'on construit. Trois conséquences techniques
s'ajoutent : une énumération de canaux dans le domaine violerait ADR-13 (test : _le catalogue
compile-t-il sans le module Shopify ?_), un `GTIN/EAN-13` n'est **pas** un canal mais un identifiant
mondial émis par GS1, et les tables `*_variant_binding` font déjà ce travail du bon côté de la
frontière.

**Unicité — trois couches, une seule garantie** :

- **value object** → la **forme** (constructeur unique `Sku.create()`, normalisation incluse : un SKU
  invalide ou non normalisé **ne peut pas exister en mémoire**) ;
- **vérification en commande** → le **message clair**. Elle ne garantit rien (TOCTOU assumé et
  documenté), elle existe pour l'ergonomie ;
- **index unique en base** → **la** garantie. La violation `23505` est traduite en
  `SkuAlreadyUsedError` par l'**adaptateur de dépôt** — pas en `ConflictException` dans le service :
  ni Postgres ni HTTP ne remontent dans l'application.

La normalisation en value object a un effet non évident : puisque la valeur stockée est toujours en
majuscules, un index unique **ordinaire** suffit à garantir l'unicité insensible à la casse.

**Unicité _par canal_** : garantie par un index unique sur la colonne de référence de **chaque table
de binding** — une table **étant** un canal, l'unicité par canal est structurelle et n'exige aucun
discriminant. Par défaut la colonne est `NULL` et l'adaptateur pousse le SKU interne ; elle n'est
renseignée que si le canal ne peut pas l'accepter (PLU numérique).

**SKU par défaut** : **opaque** — `P-XXXXXX` pour le produit, `P-XXXXXX-{N}` pour ses déclinaisons,
charset `A-Z 0-9 -`. Il est **proposé** à la création, **calculé une seule fois** (renommer un produit
ne renomme pas sa référence) et **modifiable**. Collision → **re-tirage** d'un identifiant frais pour
le produit ; suffixe numérique lisible pour la déclinaison, jamais un hash.

> **Révisé le 2026-08-23 — le signifiant est abandonné.** La forme retenue à l'origine
> (`{FAMILLE}-{PRODUIT}[-{DÉCLINAISON}]`) dérivait la référence du **slug de famille** et du **nom du
> produit**, puis la figeait : reclasser un produit laissait sa référence affirmer une famille qui
> n'était plus la sienne. L'invariant « rien ne parse jamais un SKU » protège le code de ce mensonge,
> **pas l'humain qui le lit** — or c'est précisément pour lui que le signifiant avait été choisi.
>
> L'argument « il sera lu à voix haute au labo » penche en fait dans l'autre sens. Six caractères
> tirés d'un alphabet **sans caractères ambigus** (ni `I`, ni `O`, ni `0`, ni `1`) se dictent mieux
> qu'une chaîne longue qu'il faut épeler. C'est le raisonnement, l'alphabet et le motif de tirage de
> la référence société `C-XXXXXX` (ADR B2B) — deuxième usage, donc généralisation légitime.
>
> **Le besoin d'une référence à format imposé ne disparaît pas** ; il est servi là où il doit l'être :
> `channel_reference` dans la table de binding du canal (ADR-13, ci-dessus), et le champ `sku` de
> `CreateProduct` — reprise d'un ancien catalogue, référence fournisseur, format contractuel. **Le
> back-office, lui, ne propose plus de saisie** : il n'a rien à proposer avant que le produit existe,
> et rien à modifier ensuite. La porte est celle de l'API, pas celle du formulaire.
>
> **Aucune migration** : rien ne parse un SKU et aucune référence existante ne change. Les produits
> déjà créés gardent la leur ; seuls les suivants naissent sous la nouvelle forme.

**Conséquences** :

- Le `sku` reste **modifiable** par un verbe explicite ; les canaux bindent sur l'**`id`** (R1).
- Un registre runtime contenant `RegExp` et fonctions ne traverse pas JSON,
  contrairement à ce qu'affirmait la proposition d'origine : le partage du format
  doit donc se faire **à la compilation**.

  🔴 **Cette phrase désignait `packages/shared-types`, au présent. Ce paquet n'a
  jamais existé** (constaté le 2026-09-22), et le `CLAUDE.md` du dépôt l'interdit
  explicitement — « pas de `packages/shared-types` global qui mélangerait les deux
  langages ». L'ADR présentait donc comme acquis quelque chose que les
  conventions refusent.

  **Ce qui est vrai** : `SKU_PATTERN` et `SKU_MIN_LENGTH` ne vivent qu'au
  backend (`pim/catalogue/product/domain/value-objects/sku.value-object.ts`), le
  front ne les a pas, et le partage reste **à faire**. Le véhicule légitime
  existe déjà et s'appelle `packages/pim-contracts` — un contrat du référentiel,
  pas un sac de types transverse.

- **GTIN/EAN-13 descopé** (ADR-14) : la plupart des articles sont vendus non préemballés, les codes
  valides s'achètent auprès de GS1, et le code-barres est un besoin de **caisse** → binding, à D4.
- Détail : [`data-model/06-identifiants-et-sku.md`](../pim/data-model/06-identifiants-et-sku.md).
  Proposition d'origine archivée (non normative) sous `data-model/_sources/`.

## ADR-17 — Secrets d'intégration hors base ; pilote de canal derrière un port

> 🔴 **Partiellement caduque depuis le 2026-09-21.** Le canal Shopify est sorti
> du dépôt, avec son port `ShopifyDriver`, son pilote `dry-run` et son écran de
> réglages ; sa documentation a été retirée le 2026-09-22.
>
> **Ce qui SURVIT, et c'est l'essentiel** : un jeton d'API ne vit jamais en base,
> et un écran n'affiche que sa PRÉSENCE. C'est une frontière de sécurité, vraie
> de toute intégration — elle ne dépendait pas de Shopify et s'applique à la
> prochaine. **Ce qui est mort** : tout ce que cet ADR dit du pilote, du port et
> du `dry-run`.

**Décision** : les **réglages** d'un canal (domaine de boutique, version d'API, activation)
vivent en base et se pilotent depuis l'écran Réglages ; le **jeton d'API** vit dans
l'environnement (`AppConfig`) et **jamais en base**. L'écran affiche seulement sa _présence_, jamais
sa valeur. Le transport vers le canal est isolé derrière un port `ShopifyDriver`, dont
l'implémentation par défaut est un pilote **`dry-run`** qui n'émet aucun appel réseau.

**Raison** :

- Un secret en base **fuite par les sauvegardes, les exports, les dumps et les logs**, et devient
  lisible par quiconque ouvre l'admin. Le distinguer d'un réglage ordinaire est une frontière de
  sécurité, pas une préférence.
- Le pilote réel **ne pouvait pas être écrit honnêtement** au moment de la
  décision : l'API Admin de Shopify est versionnée trimestriellement et nous
  n'avions ni boutique ni jeton. Écrire des mutations invérifiables aurait
  produit du code _plausible et faux_.

  ⚠️ **Cette prémisse est tombée deux fois.** D'abord en sa faveur : la
  connexion a été établie le 2026-08-04, la forme exacte de `productSet` relevée
  en direct, et `SHOPIFY_ADMIN_TOKEN` posé par le déploiement — le `dry-run`
  cessait d'être une nécessité pour devenir un choix de mode. Puis contre elle :
  le canal est sorti du dépôt le 2026-09-21, et il n'y a plus rien à piloter.

  Les deux documents qui portaient ces relevés ont été retirés le 2026-09-22 ;
  ce qu'ils attestaient vit dans l'histoire git. **Ne pas les rechercher pour
  écrire une nouvelle intégration** : l'API Admin de Shopify est versionnée
  trimestriellement, et un relevé d'août 2026 serait exactement le « plausible
  et faux » que cet ADR dit d'éviter.

- Le mode `dry-run` n'est pas un bouchon : il exerce toute la chaîne — lecture par le port,
  projection, empreinte, écriture du binding — et rend le comportement observable **maintenant**.

**Conséquences** :

- `mode = live` exige **deux** conditions : intégration activée **et** jeton présent. Activer sans
  jeton ne doit pas laisser croire qu'on pousse pour de vrai ; l'écran et chaque compte-rendu de
  push rappellent le mode.
- L'**empreinte** (`sha256` d'une sérialisation à clés triées) sert deux fins : ne pas repousser
  l'identique (les canaux ont des quotas), et détecter la dérive. Le tri des clés n'est pas
  cosmétique — sans lui, deux objets équivalents donneraient deux empreintes et tout paraîtrait
  modifié en permanence.
- Un produit **non publié est projeté en brouillon** : aucune mise en ligne par inadvertance.
- Les pushs sont **séquentiels** : une rafale parallèle se ferait étrangler par les quotas.
- L'adaptateur lit le catalogue par le seul port exporté, `CatalogueReader` (ADR-13). Le module
  `catalogue` n'exporte **ni ses dépôts ni ses commandes** — supprimer le canal ne casserait rien.

## ADR-18 — Deux clientèles, et un tarif négocié par client (clôt D1)

**Décision** : la plateforme sert **deux clientèles** — les professionnels et les
particuliers (`OrderClientele = pro | public`) — et le tarif d'un professionnel
est **négocié par client**, pas dérivé d'une grille unique.

> ⚠️ **Décision constatée, pas prise.** D1 demandait « revente pros confirmée ?
> paliers de volume + tarifs négociés par client ? ». Le code a répondu aux deux
> en les construisant, et Hugo l'a confirmé le 2026-09-22 : « on peut les fermer,
> le code a tranché ». Cette ADR **enregistre** ce que le dépôt fait déjà.

**Ce qui l'atteste** (mesuré le 2026-09-22) :

| Question de D1               | Ce que le code porte                                                     |
| ---------------------------- | ------------------------------------------------------------------------ |
| Revente aux pros ?           | `OrderClientele` vaut `pro` **ou** `public` — les deux sont servies      |
| Tarifs négociés par client ? | `CompanyMercuriale` — « le tarif négocié d'un client, en un seul objet » |
| Paliers de volume ?          | `VolumeLadder` et `VolumeCommitment`                                     |

**Conséquence** : le référentiel ne décide **pas** du prix d'un professionnel. Il
pose un prix de liste ; la mercuriale, le dégressif et les promotions viennent
par-dessus, dans la plateforme. ⚠️ `CatalogItemOverride` est clé par **SKU** et
non par société : c'est le prix de liste du canal B2B, **pas** un prix négocié.
Les confondre ferait chercher le tarif d'un client au mauvais endroit.

## ADR-19 — Le plan de production est consolidé tout seul, mais arrêté à la main (clôt D2)

**Décision** : la demande multi-canal est consolidée **automatiquement** en
compte à produire ; le moment où ce compte est **figé** est un geste humain, pris
**par journée** et jamais par commande.

> ⚠️ D2 posait « auto ou manuel ? ». La réponse du code est **plus précise que la
> question** : les deux, sur deux axes différents.

**Raison**, telle que le handler de clôture l'écrit lui-même :

- Les deux façons d'arriver à une bascule sans geste humain sont **fermées** :
  l'API n'a aucun planificateur, et écrire depuis une lecture est interdit
  (« une requête de lecture n'écrit rien, pas même un compteur »).
- Ce qu'on refuse est une décision **par commande** — c'est-à-dire un tri, un
  jugement. Une bascule **par journée** ne demande à personne de juger : elle
  acte une heure.
- Le geste existe déjà dans la vraie vie : l'équipe arrête de prendre pour
  demain.

**Conséquences** :

- Le compte à produire est un **instantané**. Rejouer la clôture ne recalcule
  rien — l'agrégat refuse, parce que les commandes bougent après.
- Seules les journées **closes** sortent du lecteur de plan : rendre une journée
  ouverte la ferait passer pour arrêtée, et la colonne afficherait un zéro qu'on
  croirait mesuré.

## ADR-20 — La TVA est paramétrable, et vit à l'intersection article × contexte (clôt D5)

**Décision** : les taux de TVA sont une **donnée** (`VatRate`), pas une
énumération du code, et le taux applicable se lit à l'intersection d'un article
et d'un **contexte de vente** — `category_context_tva`, avec une dérogation par
fiche dans `product_context_tva`.

> ⚠️ D5 était « à confirmer avec le comptable ». Hugo a confirmé le 2026-09-22.
> Le mécanisme, lui, était bâti depuis le 2026-08-24.

**Raison** : reconnaître un taux de plus, ou une manière de vendre de plus, doit
être **une ligne en base**, jamais un déploiement. C'est le même motif que les
contextes de vente et les appellations — la dimension qui grandit est pilotée par
la donnée.

**Conséquences** :

- Deux taux au même pourcentage sont **impossibles** : l'unicité porte sur le
  taux, et c'est un invariant fiscal.
- La distinction emporter / sur place n'est pas un champ : c'est **un contexte de
  vente**, donc une ligne, et elle se règle sans toucher au code.

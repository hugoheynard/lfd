# LFC PIM — Journal de bord

> Tenu au fil de l'eau. Chaque ajout a **deux lectures** : **PM** (ce que ça change pour le produit /
> le métier, sans jargon) et **Tech** (ce qui a été fait, et pourquoi comme ça).
>
> Ce journal raconte le **chemin**. Les décisions structurantes vivent dans [`adr.md`](./adr.md),
> les restes à faire dans [`todo.md`](./todo.md), le modèle dans [`data-model/`](./data-model/).

**Tenue** : une section `## AAAA-MM-JJ` par jour, la plus récente **en haut**. Un `###` par ajout.
On n'y met que ce qui mérite d'être retrouvé dans trois mois.

---

## 2026-07-21 — Jour 2

### Renommage : le produit s'appelle LFC PIM

**PM** — Le produit prend son nom de marque : **LFC PIM**. Chevallot reste ce qu'il est — la
boulangerie cliente — et continue d'apparaître partout où on parle d'elle.

**Tech** — Renommage complet plutôt que cosmétique, pour ne pas laisser l'écart se creuser :
`apps/lfc-PIM-{backend,frontend}`, packages `lfc-pim-*`, script `lfc-suite:dev:watch`, configs
`.run/`, `documentation/lfc/`, et la base `lfc_pim` (utilisateur `lfc`). Volume Docker détruit et
migrations rejouées à neuf — les données d'essai sautent, c'est le prix d'un renommage franc.

Distinction tenue : **« Chevallot PIM » → « LFC PIM »**, mais « la boulangerie Chevallot » et
« Signature Chevallot » **restent**. Un `sed` global aurait effacé le client avec le produit.

*Vérifié après coup* — base recréée, migrations appliquées, chaîne complète rejouée (famille →
produit avec allergènes, éditorial et visuel → push Shopify). tsc, lint, gate, 70 tests, build AOT.

### La fiche produit en trois cartes : Identité · Nutrition · Communication

**PM** — La fiche de création est réorganisée en **trois onglets** correspondant à trois métiers
différents : ce qu'**est** le produit, ce qu'il **contient**, et comment on en **parle**. L'onglet
Nutrition porte une **pastille rouge** tant que les allergènes ne sont pas renseignés — on ne peut
plus l'oublier par inadvertance. L'onglet Communication ouvre la partie éditoriale : résumé court,
description longue, récit, accord, marque, SEO, et des **emplacements de visuels** (principale,
galerie, ambiance, miniature, impression).

**Tech** — Implémentation de la couche éditoriale (doc 01), jusque-là seulement conçue.

- **`product_editorial`** — satellite **optionnel** en PK = FK : la ligne n'existe que si quelqu'un
  a écrit quelque chose. Rythme de vie propre (l'éditorial change chaque saison, l'identité jamais),
  ce qui justifie une table plutôt que des colonnes.
- **`media_asset` + `product_media`** — agrégat propre et **table de liaison dédiée**. Pas de FK
  polymorphe `owner_type`/`owner_id` : Postgres ne pourrait alors garantir **aucune** intégrité
  référentielle. On stocke le master ; les tailles dérivées sont calculées par chaque canal.
- **Invariant ajouté** : un seul visuel `hero`, un seul `thumbnail`. Vérifié dans le domaine,
  refusé en **400** — sans quoi le canal choisirait arbitrairement lequel afficher.
- **Un champ vidé efface la colonne** (`Prisma.DbNull`) au lieu de la laisser telle quelle : une
  clé omise en `update` ne changerait rien, et le texte supprimé resterait en ligne.
- Le vide n'est jamais une valeur : aucun `{ fr: "" }` n'est écrit.

*Vérifié en base* — création complète relue : `VIEN-GALETT-ROIS`, marque, résumé, **2 visuels**
avec leurs rôles ; deux `hero` → refusé. tsc, lint, gate, 70 tests, build AOT.

⚠️ **L'envoi de fichiers n'est pas branché** — on saisit une adresse. Le stockage (R2/S3) est une
décision d'infrastructure à part entière, pas un détail de formulaire.

### Fiche de création produit, avec les allergènes

**PM** — Un bouton **Créer un produit** ouvre une vraie fiche : identité, **allergènes**, et
valeurs nutritionnelles optionnelles. Les allergènes se cochent depuis notre référentiel, groupés
par **catégorie d'étiquette** — cocher « blé », « seigle » ou « orge » revient au même sur
l'étiquette (« Céréales contenant du gluten »), et le formulaire le montre au lieu de le cacher.
Deux catalogues : **UE / France** par défaut (la liste légale) et **Monde** (l'interopérable, B2B).
Et une distinction qui compte : « aucun allergène » **coché** ≠ champ laissé vide.

**Tech** — ⚠️ Le référentiel ne couvrait que **6 catégories INCO sur 14** : insuffisant pour un
formulaire réglementaire. Complété aux **14 de l'annexe II du règlement UE 1169/2011**, avec les
codes granulaires n:1 (blé/seigle/orge/avoine/épeautre → gluten ; noix/noisette/amande/pistache/
cajou/pécan → fruits à coque). **Les catégories sont exactes ; les codes GS1 restent tous
provisoires** — ceux ajoutés portent le préfixe `TBD_`, repérables au grep, et un drapeau
`provisional` remonte jusqu'au bandeau d'avertissement du formulaire. Sur un champ réglementé, une
donnée provisoire doit se voir.

- **`nutrition_declaration`** — `variant_id` PK **et** FK (*shared primary key*), fiche
  **optionnelle** : son absence signifie « non renseigné ». Un 1:1 obligatoire aurait forcé une
  ligne vide à la création, donc affirmé « aucun allergène » sans vérification.
- **Validation dans le domaine, pas dans le DTO** : code inconnu, chevauchement
  `allergens ∩ mayContain`, valeurs négatives. Vérifiée **avant toute écriture** — une fiche
  refusée ne laisse pas un produit à moitié créé.
- **`GET /reference/allergens?scope=eu|world`** — deux catalogues, une seule donnée. Ce n'est pas un
  filtre d'affichage : `eu` est la liste **légale**, `world` la liste **interopérable**.

*Piège évité de justesse* — `UnknownAllergenError` déclarait un champ `code`, qui **masquait** le
code d'erreur lu par le filtre HTTP : l'API aurait renvoyé `TBD_FISH` là où on attend
`catalogue.allergen.unknown`. Renommé `allergenCode`, avec le commentaire qui explique pourquoi.

*Vérifié en vrai* — catalogue UE (23 entrées) et Monde (24), création avec `["AW","AM","AE"]`
relue correctement, code inconnu → **400**, chevauchement → **400**. tsc, lint, gate, 70 tests,
build AOT.

### Canal Shopify : écran Réglages et bouton « Pousser »

**PM** — Un écran **Réglages** apparaît : domaine de la boutique, version d'API, activation. Et le
tableau produits gagne une colonne **Shopify** plus un bouton **Pousser** — par ligne ou pour tout le
catalogue. Tant qu'aucun jeton n'est fourni, tout tourne en **simulation** : la chaîne complète
s'exécute, rien ne part vers l'extérieur, et chaque compte-rendu le rappelle. Deux garde-fous
utiles : un produit poussé deux fois sans modification est **ignoré** la seconde fois, et un produit
en brouillon arrive **en brouillon** — jamais en ligne par accident.

**Tech** — Adaptateur `channels/shopify/`, dépendant du catalogue et jamais l'inverse
→ [ADR-17](./adr.md#adr-17--secrets-dintégration-hors-base--pilote-de-canal-derrière-un-port).

*Le secret ne va pas en base.* Réglages non sensibles en base et pilotables depuis l'écran ; **jeton
d'API dans l'environnement** (`SHOPIFY_ADMIN_TOKEN` via `AppConfig`). L'écran affiche sa *présence*,
jamais sa valeur. Un secret en base fuite par les sauvegardes, les exports et les logs — c'est une
frontière de sécurité, pas un détail de rangement. Conséquence : `mode = live` exige **deux**
conditions (activé **et** approvisionné), sinon on croirait pousser pour de vrai.

*Le pilote réel n'est pas écrit — délibérément.* L'API Admin de Shopify est versionnée
trimestriellement et nous n'avons ni boutique ni jeton : écrire des mutations invérifiables
produirait du code plausible et faux. `ShopifyDriver` est un port ; l'implémentation par défaut est
un pilote `dry-run` qui exerce **toute** la chaîne sans réseau. Le spike d'une journée ne touchera
que ce fichier.

*Ce qui a de la valeur, c'est la projection.* `projectProduct` est **pure** : catalogue → vocabulaire
Shopify. `fingerprint` sérialise **à clés triées** — sans ce tri, deux objets équivalents donneraient
deux empreintes et tout paraîtrait modifié en permanence. L'empreinte sert à ne pas repousser
l'identique (les canaux ont des quotas) et à détecter la dérive. **8 tests** dédiés.

*Frontières.* `CatalogueReader` devient le **seul** contrat exporté par le catalogue : l'adaptateur
ne voit ni ses dépôts, ni ses tables, ni ses commandes. Deux tables de binding, pas une : l'état de
synchro est au niveau **produit** (Shopify pousse produit + variantes ensemble), la *référence de
canal* reste sur la **déclinaison** (R4) avec son index unique — l'unicité par canal, structurelle.
Les relations Prisma vers le socle sont **virtuelles** : aucune colonne n'est ajoutée au catalogue,
la clé étrangère est portée par le binding.

*Vérifié en vrai* — réglages lus, enregistrés, push exécuté (2 produits « simulé »), **re-push
renvoyant « inchangé »**, bindings passés à `up_to_date`. tsc, lint, gate, **70 tests**, build AOT.

### Le PIM existe : familles paramétrables et tableau produits

**PM** — Il y a maintenant quelque chose à ouvrir. On crée des **familles** (Viennoiseries,
Pâtisserie…), on saisit des **produits** dans un tableau, et le système attribue tout seul une
référence lisible — `PATI-TARTE-FRAISE`. Deux produits du même nom ? Le second devient
`…-FRAISE-2`, sans qu'on ait à y penser. Rien ne s'efface : on archive.

**Tech** — Chaîne complète en une passe, socle → base → API → écran.

*Base* — migration `socle_catalogue` : `category`, `product`, `product_variant`, plus un
**`sku_registry`**. Ce dernier n'était pas prévu : l'unicité du SKU est déclarée **globale**
(produits et déclinaisons confondus) et une contrainte d'unicité ne s'étend pas à deux tables. Le
registre porte la garantie — sa clé primaire **est** l'invariant. Aucun identifiant par défaut en
base (**R1**) : `IdGenerator` fournit des **UUID v7**, ordonnés donc amicaux pour l'index.

*Collision de conception rencontrée en chemin* — la déclinaison par défaut d'un produit sans option
visait exactement la référence de son produit, donc échouait sur le registre. Corrigé : sans option
discriminante, la déclinaison retombe sur son **rang** (`PATI-TARTE-FRAISE-1`), ce qui se lit comme
une numérotation d'atelier. C'est l'espace de noms global qui l'impose — la doc 06 le dit désormais.

*Frontières tenues* — le domaine ne connaît ni Prisma ni HTTP. Les dépôts sont des classes
abstraites servant de **jetons d'injection** ; la violation d'unicité est traduite en
`SkuAlreadyUsedError` **dans l'adaptateur**. Un filtre unique traduit les catégories en statuts
(400 / 404 / 409 / 500) — seul point du système qui connaît à la fois le domaine et le transport.
Produit + déclinaison + réservations partent en **une transaction** : l'invariant « au moins une
déclinaison, exactement une par défaut » n'est jamais faux, pas même une fraction de seconde.

*Deux frictions des flags stricts, résolues sans concession* — `exactOptionalPropertyTypes` impose
`?: string | undefined` aux frontières ; et une interface à clés fixes n'est pas assignable au JSON
de Prisma (pas d'index signature) → conversion explicite `localizedColumn()` plutôt qu'un cast. Le
compilateur avait raison les deux fois.

*Front* — Angular zoneless, standalone, **signals uniquement** : zéro `FormsModule`, les champs sont
des `signal` pilotés par `(input)`. Deux écrans (Familles, Produits), routes paresseuses, thème
clair/sombre. Rendu **client** assumé côté SSR : préparer les pages au build n'aurait rien à afficher.

*Vérifié* — tsc, lint, gate, **62 tests**, build AOT ; et l'API éprouvée au `curl` de bout en bout,
y compris les refus (payload invalide → 400, famille inconnue → 404, référence prise → 409).

⚠️ **Dette assumée et suivie** : le contrôleur catalogue est en `@Public()`, donc **l'API est
ouverte** — sans ça le guard Auth0 global rejetterait tout et le back-office serait inutilisable
tant que le tenant n'existe pas. À retirer en priorité. Le front redéclare aussi les types du
contrat, faute de `packages/shared-types`.

### Premier code du catalogue : la référence produit

**PM** — Le système sait maintenant fabriquer une référence lisible tout seul
(`PATI-TARTE-FRAISE-6P`), refuser une référence mal formée, et rattraper une collision sans jamais
produire deux fois la même. Rien n'est encore branché à la base — mais la règle est écrite une fois,
au bon endroit, et testée.

**Tech** — Premier slice de `catalogue/domain`, **pur** : ni Nest, ni Prisma, ni HTTP.

- `shared/errors/app-error.ts` — trois catégories (`domain` / `business` / `technical`), aucune ne
  connaît HTTP : la traduction en statut appartient au filtre d'exceptions, à la frontière.
- `catalogue/domain/value-objects/sku.value-object.ts` — constructeur privé, `Sku.create()` unique
  point d'entrée : **un SKU invalide ou non normalisé ne peut pas exister en mémoire**. Conséquence
  vérifiée par un test dédié : `' ecl-01 '` et `'ECL_01'` sont structurellement égaux — c'est ce qui
  permet à un index unique **ordinaire** de garantir l'unicité insensible à la casse.
- `catalogue/domain/services/sku-generator.ts` — génération signifiante
  `{FAMILLE}-{PRODUIT}[-{DÉCLINAISON}][-{N}]`, mots vides français retirés, troncature sans tiret
  orphelin, collision → suffixe numérique lisible, échec franc après 10 tentatives plutôt qu'une
  boucle. Dépend d'un **port** `SkuAvailability`, jamais d'un dépôt.

**35 tests** ajoutés (62 au total, 7 suites) ; tsc, lint et gate verts. Les cas limites couverts sont
ceux qui mordent en vrai : accents, séparateurs multiples, nom entièrement composé de mots vides,
troncature à la longueur maximale **avec** place pour le suffixe.

### Le SKU : une seule référence, et des libellés de canal au bord

**PM** — Premier sujet traité en profondeur. Une proposition de conception voulait **un SKU différent
par canal** (un pour Shopify, un pour la caisse, un pour le code-barres). Écartée : c'est exactement
ce qui détruirait le référentiel commun qu'on construit. **Un article, une référence** — celle que le
boulanger prononce. Ce que chaque logiciel appelle l'article reste au niveau de ce logiciel. Et le
système **propose désormais une référence lisible tout seul** (`PATI-TARTE-FRAISE-6P`), modifiable.

**Tech** — Revue adversariale de `_sources/sku-module-nestjs-doc.md` (archivée, non normative) →
[`06-identifiants-et-sku.md`](./data-model/06-identifiants-et-sku.md) +
[ADR-16](./adr.md#adr-16--un-sku-interne-unique--les-références-canal-vivent-au-bord).

*Erreur de catégorie* — `Sku = (variantUuid, channel, value)` avec `channel ∈ {shopify, caisse,
ean13}` : un SKU est par définition la référence **du commerçant** ; `ean13` n'est pas un canal mais
un identifiant **mondial** émis par GS1 ; et un enum de canaux dans le domaine **viole ADR-13** (le
catalogue ne compilerait plus sans le module Shopify). Les tables `*_variant_binding` faisaient déjà
ce travail du bon côté de la frontière.

*Exigence « unicité par canal » satisfaite autrement, et mieux* — un index unique sur la colonne de
référence de **chaque table de binding**. Une table **étant** un canal, l'unicité par canal devient
structurelle, sans discriminant ni ligne de domaine à toucher pour en ajouter un. Cas nominal :
colonne `NULL`, l'adaptateur pousse le SKU interne ; renseignée uniquement si le canal ne peut pas
l'accepter (PLU numérique).

*Le SKU n'est pas un module* — pas d'entité, pas de service, pas de `POST /skus` (API en forme de
table, et **second chemin d'écriture** contre R2 : les verbes `CreateProduct` / `AddVariant` /
`ChangeVariantSku` le portent déjà). C'est un **value object** à constructeur unique : un SKU invalide
ou non normalisé ne peut pas exister en mémoire — là où la proposition validait dans un DTO Zod, donc
seulement sur le chemin HTTP (un import CSV ou un seed l'aurait contourné).

*Effet non évident de la normalisation* — la valeur stockée étant toujours en majuscules, un index
unique **ordinaire** garantit l'unicité insensible à la casse ; pas besoin d'index fonctionnel. Avec
la normalisation en `.transform()` Zod, `ecl-01` importé hors HTTP cohabitait avec `ECL-01`.

*Unicité : trois couches, une seule garantie* — value object (forme) · vérification en commande
(**message**, TOCTOU assumé et documenté pour que personne ne s'y fie ni ne la supprime) · index
unique (**la** garantie). Le `23505` est traduit en `SkuAlreadyUsedError` par l'**adaptateur de
dépôt**, pas en `ConflictException` dans le service : ni Postgres ni HTTP ne remontent dans
l'application.

*SKU par défaut* — **signifiant** plutôt que séquentiel (il sera lu à voix haute au labo et cherché
sur un écran de caisse à 6h) ; son défaut habituel — l'information se périme — est neutralisé par
l'invariant **« rien ne parse jamais un SKU »**. Format `{FAMILLE}-{PRODUIT}[-{DÉCLINAISON}][-{N}]`,
charset `A-Z 0-9 -` (l'intersection sûre de Shopify, caisse, CSV, étiquettes, URL). Proposé, calculé
**une seule fois** (renommer un produit ne renomme pas sa référence), modifiable ; collision →
suffixe numérique lisible, jamais un hash.

*Deux relevés de vigilance* — le partage front/back annoncé par la proposition était **impossible**
(le registre contient `RegExp` et fonctions : rien ne traverse JSON) → partage **à la compilation**
via `shared-types`, les libellés d'aide restant côté front. Et ses constantes (`16` caractères
Shopify, `6` chiffres caisse) sont **affirmées sans source** — marquées à vérifier avant tout usage.

### Cadrage global : anti-drift, pricing, et pourquoi on construit

**PM** — Prise de recul sur l'ensemble. Trois clarifications qui changent la façon de piloter le
projet. **La bataille « qui détient le catalogue » n'a pas lieu d'être** : ce qui compte n'est pas le
catalogue mais chaque champ, et une seule règle — un champ, un seul auteur. **Les prix négociés ne
sont pas des exceptions bricolées** mais des règles qu'on possède et qu'on calcule. Et surtout : ce
qu'on construit n'est **pas un PIM**, c'est la **colonne vertébrale** qui fait tenir ensemble la
caisse, le web et le labo — le catalogue n'en est que la première vertèbre.

**Tech** — Quatre cadres posés, aucun code.

*Anti-drift* — l'unité de décision est le **champ**, pas le catalogue : une matrice
champ × système avec **un seul `W` par ligne**. Quatre familles à régimes opposés (catalogue ⬇️ ·
prix ⬇️ · transactions ⬆️ · production ⬆️) et une règle : **le flux ne boucle jamais**. Trois
régimes possibles par champ, dont le plus réaliste est le troisième, souvent oublié : **surveillé**
— le PIM connaît l'état voulu, **ne corrige pas**, mais **signale l'écart** (relecture + écran de
dérives). Écraser silencieusement la correction faite en caisse à 7h est le meilleur moyen de faire
débrancher l'outil.

*Promotions* — elles ne sont **pas portables** : ce sont des programmes, pas des données. Shopify
applique au panier, une caisse au ticket. Cible retenue : le PIM possède l'**intention commerciale**
(`Campagne`), chaque adaptateur la **compile**, et on supporte explicitement l'**intersection** — pas
l'union. Une campagne qu'un canal ne sait pas exprimer est **refusée à la saisie**, jamais dégradée.

*Pricing* — correction d'un modèle mental : il n'y a **pas de prix canonique**. Le prix est une
fonction `f(déclinaison, canal, client, date, quantité)`. Le tarif B2B n'est **pas** un override du
canal — **canal ≠ client** (deux axes : par où / à qui). Trois objets : `PriceList`, `PriceRule`, et
`Agreement` — ce dernier appartenant au **contexte commercial, pas au PIM** (sinon le PIM aspire le
CRM). La résolution **calcule** et **trace** le chemin au lieu d'empiler des écarts indébogables.
Corollaire pratique : les canaux reçoivent un **nombre déjà résolu** — le moteur est unique, chez
nous.

*Construire vs acheter* → [ADR-15](./adr.md#adr-15--construire-un-pim-minimal-plutôt-quen-acheter-un).
Décision : construire, **minimal**. L'argument décisif n'est pas le coût mais l'**ajustement sur le
spécifique** (`kind`, capacité de production ≠ stock, GS1→INCO, déclinaison commune caisse/web) —
qu'aucun PIM générique ne porte autrement qu'en **configuration**, c'est-à-dire en renonçant au
bénéfice des types (ADR-10). Le socle fait six tables ; 80 % de l'effort est l'intégration, qu'aucun
achat ne dispense. Coût réel assumé et nommé : **le back-office**, pas le modèle — d'où la consigne
« garder le back-office laid ». Périmètre fermé (pas de moteur d'attributs, pas de workflows, pas de
DAM, pas de multi-tenant), **test permanent** écrit, et **conditions d'invalidation** posées :
la décision est **testable** par D4 et D1, pas une conviction.

### Revue adversariale du modèle de données — et son redressement

**PM** — Passe critique sur le modèle avant d'écrire la moindre table : on a cherché ses défauts au
lieu de le défendre. Trois choses importantes en sont sorties. **Un risque légal** a été éliminé : le
modèle affirmait « aucun allergène » par défaut sur un produit que personne n'avait vérifié.
**Une complexité coûteuse** a été reportée : l'historisation complète du catalogue, qu'on payait à
vie pour un bénéfice qu'on n'a pas encore. **Un flou** a été levé : trois documents décrivaient le
même produit différemment. Le modèle est maintenant plus simple, plus sûr, et prêt à être codé.

**Tech** — Douze défauts relevés, tous traités :

*Fond* — le modèle était **conçu table-first** puis étiqueté « event-sourced » : aucune commande,
aucun event nommé nulle part, alors que D6 (frontières d'agrégat) était déclaré bloquant. Nouveau
doc [`00-langage-et-comportement.md`](./data-model/00-langage-et-comportement.md) : glossaire
ubiquitaire (« un client achète une **déclinaison**, jamais un produit »), **4 agrégats** (`Product`
racine possédant déclinaisons + fiches réglementaires ; `Category` ; `Collection` ; `MediaAsset`),
la **liste exhaustive des commandes et des faits**, le cycle de vie `draft → published → archived`.
**D6 est clos**, le schéma Prisma est débloqué.

*ADR-11 rétrogradé* — sa justification (« zéro `created_at`/`updated_at` ») était esthétique **et
fausse** : une projection a de toute façon besoin de `last_event_version`/`projected_at`. Coût réel
(projecteurs, upcasting, hard-gate de replay, à vie) disproportionné pour un catalogue édité par
trois personnes. Précédent interne : sur SH3PHERD l'event store est arrivé en **couche 3 phase C**,
pas au jour 1. Conservé de façon **irréversible** : **R1** ids assignés par la commande (UUID v7
applicatif — le seul point vraiment irrattrapable, la caisse et Shopify pointent dessus), **R2** toute
mutation porte un nom métier, **R3** aucun `DELETE`. Colonnes système assumées, hors-domaine.

*Sécurité de la donnée réglementaire* — `PRODUCT ||--|| NUTRITION_INFO` (1:1 **obligatoire**) forçait
une ligne vide à la création, donc `allergens: []` = « aucun allergène » **sans vérification**. Passé
en **1:1 optionnelle**, PK = FK (plus d'`id` de substitution qui autorisait deux fiches), **rattachée
à la déclinaison** (c'est elle qui est mise sur le marché) et **sans fallback à la lecture** — la
duplication est écrite à la commande. Garde : pas de publication sans fiche.

*Cohérence* — `01-produit.md` re-spécifiait le socle **différemment** de `02` (`name` string vs
LocalizedText, `has_variants`, `barcode`…) : amputé, il ne couvre plus que l'éditorial. Nettoyages :
`has_variants` supprimé (dérivable, et sa « déclinaison implicite » remplacée par une déclinaison
**toujours matérialisée**), `is_bio` supprimé **×2** (trois sources de vérité pour un fait —
`certifications` fait foi), `sku` rendu **modifiable** et à espace de noms **global**, FK polymorphe
des médias remplacée par trois tables de liaison, `kind` explicitement marqué « pas un aiguillage »
(OCP), `Category` scindée en **taxonomie** (arbre) + **`Collection`** (n:n).

*Nouveau* — [ADR-13](./adr.md#adr-13--composition-par-tables-satellites-canaux-au-bord) et
[`04-composition-et-canaux.md`](./data-model/04-composition-et-canaux.md) : trois natures de table
(socle / couche canonique / contexte canal), motif **PK = FK**, bindings sur la **déclinaison** par
`id`, séparation binding mécanique ↔ overrides éditoriaux, **règle de promotion** de `attributes`.
Le `pos_family_code` PI Helios **sort de `Category`**. [ADR-14](./adr.md#adr-14--couche-logistique-descopée-de-la-v1) :
couche logistique et hiérarchie GDSN **descopées** — le code-barres reviendra par le binding caisse
quand D4 sera tranché.

### Correctif : le `.env` n'était pas chargé au démarrage

**PM** — Le backend refusait de démarrer en disant qu'il manquait la configuration de la base… alors
qu'elle était bien renseignée. Corrigé : l'application lit désormais son fichier de configuration au
démarrage.

**Tech** — Le `.env` n'était chargé que par la **CLI Prisma** (`prisma.config.ts` importe
`dotenv/config`) ; **rien ne le chargeait au runtime Nest** → `process.env.DATABASE_URL` vide → le
fail-fast se déclenchait (il faisait son travail, sur une cause que je n'avais pas câblée). Ajout de
**`@nestjs/config`** et de `ConfigModule.forRoot({ isGlobal: true })` **en tête** des imports
d'`AppModule`, pour que l'env soit peuplé avant l'instanciation des providers d'infra. Vérifié par un
boot **isolé sur le port 3101** (« Nest application successfully started », HTTP 200 sur `/`).

> Découverte au passage : le pool `pg` se connecte **paresseusement** — `$connect()` n'ouvre aucune
> session et ne prouve donc pas que la base est joignable. Le fail-fast ne couvre que la *config*.
> Ajouter un `SELECT 1` au boot est une **décision ouverte** (l'app refuserait alors de démarrer sans
> `pnpm dev:infra`).

### Une seule porte vers l'environnement — et un garde-fou qui la tient

**PM** — Les réglages (base, Auth0, port) ne se lisent plus n'importe où dans le code : ils passent par
un **point unique**, validé au démarrage. Et un contrôle automatique empêche de contourner la règle
plus tard — y compris par moi dans six mois.

**Tech** — `src/infra/config/AppConfig` : **seule** classe autorisée à lire `process.env`, valide au
boot (fail-fast) et expose des méthodes typées (`databaseUrl()`, `auth0Domain()`, `auth0Audience()`,
`port()`). `PrismaService`, `AuthConfig` et `main.ts` la consomment par injection — plus aucun accès
direct. **Deux filets** :
1. **ESLint** — couvre `process.env`, `process['env']`, la déstructuration, l'**alias**
   (`VariableDeclarator[init.name='process']`), `globalThis.process` et l'import `node:process`.
   Les 6 formes vérifiées une par une par fichiers sondes.
2. **Gate** `dev-toolbox/gates/no-direct-env.mjs` (`pnpm lint:no-direct-env`), **indépendant
   d'ESLint** : il détecte en plus les `// eslint-disable` visant la règle. Démonstration faite —
   ESLint seul se laisse bâillonner, le gate non.

Dérogations **explicites et justifiées** : la passerelle + son test, le harnais de test,
`prisma.config.ts` (CLI Prisma, hors runtime Nest) et `src/server.ts` (SSR Angular — le front n'a pas
encore de passerelle, dette notée au `todo.md`).

---

## 2026-07-20 — Jour 1 : socle, modèle, base, auth

### Choix du monorepo : Turborepo (Nx écarté)

**PM** — La suite LaFolieDouce hébergera plusieurs outils ; il fallait un socle commun. On a retenu
l'outillage déjà éprouvé sur l'autre projet plutôt qu'un nouvel écosystème, pour aller vite sans
réapprendre.

**Tech** — pnpm workspaces + **Turborepo** (`apps/*`, `packages/*`), calqué sur SH3PHERD. Nx a été
essayé **et abandonné** : son preset impose un TS *project-references* incompatible avec Angular
(mur rencontré à l'`init`). Turbo gagne aussi sur la transparence (tout est greppable, pas de target
inférée). → [ADR-08](./adr.md#adr-08--monorepo-turborepo--pnpm-pas-nx)

### Les deux apps du PIM sont debout

**PM** — La coquille du PIM existe : une interface et une API démarrent en local. Rien de métier
encore, mais tout le reste peut s'y greffer.

**Tech** — Scaffoldées avec les **CLI officiels** (`ng new`, `nest new`), pas à la main, puis versions
**alignées sur SH3PHERD** : Angular **22.0.7** (zoneless, SSR, SCSS) et NestJS **11.1.9**. API sur
**3100** (le 3000 est pris par SH3PHERD), front sur 4200.

### Filet de sécurité dès le premier jour

**PM** — On attrape les erreurs à la compilation plutôt qu'en production. C'est du temps investi une
fois qui évite des bugs coûteux plus tard.

**Tech** — Couche de flags partagée `tsconfig/tsflags.backend.json` (base stricte + **`noUncheckedIndexedAccess`**,
`verbatimModuleSyntax`, `noPropertyAccessFromIndexSignature`). Ces flags **imposent l'ESM** → backend
passé en `type: module` + imports `.js`. Tests : **Jest** (back) et **Vitest** (front), configs
reprises de SH3PHERD. → [ADR-10](./adr.md#adr-10--backend-esm--flags-ts-stricts-partagés)

### Dépôt privé + confort de dev

**PM** — Le code est sauvegardé chez GitHub, en **privé**. Démarrer l'environnement complet tient en
un clic.

**Tech** — Repo `hugoheynard/lfd` (privé), branche par défaut **`dev`**. `.gitignore` durci et
**vérifié** (aucun secret, `node_modules`, `dist`, `.env` versionnés). Scripts `dev:watch` par app +
`lfc-suite:dev:watch` (turbo), et configs **`.run/` WebStorm** avec un compound « une console
par process ».

### Galop d'essai : allergènes GS1 → INCO

**PM** — Premier vrai bout de métier, volontairement pris sur le sujet **le plus sensible
légalement** : les allergènes. Le système sait déjà transformer une donnée technique internationale
en affichage conforme UE.

**Tech** — Domaine pur (testable sans framework) : table de correspondance **n:1**, `toInco()`
(filtre + dédup + localise + met en évidence) et `toGdsn()` (pass-through B2B). ⚠️ **Correction en
cours de route** : j'avais d'abord modélisé un catalogue INCO plat — à l'envers de l'ADR-07. Refait
en **GS1 canonique → projection INCO**. Codes GS1 encore **provisoires** (à peupler depuis
`ref.gs1.org`).

### La documentation du projet est née

**PM** — Les décisions sont tracées avec leur *pourquoi*, et les questions encore ouvertes sont
visibles au lieu de rester dans une tête.

**Tech** — `documentation/lfc/` : index, **ADR-01→12**, **todo** (décisions ouvertes D1–D6 +
backlog), `data-model/` avec **diagrammes Mermaid**. Les docs de cadrage ont été portées dans le repo
plutôt que laissées sur le Bureau.

### Modèle de données : le produit, en couches

**PM** — On sait maintenant précisément ce qu'*est* un produit — et surtout ce qui n'en fait **pas**
partie. Le prix et la disponibilité sont des sujets à part : un même croissant n'a pas le même prix
en boutique, sur le web et en B2B.

**Tech** — Socle figé `Product` / `ProductVariant` / `Category`. Deux décisions structurelles :
**champs texte traduisibles dès J1** (`LocalizedText` = `jsonb {fr, en?}`, FR obligatoire) et
**`attributes jsonb`** comme échappatoire d'extensibilité. ⚠️ **Correction** : le premier jet mélangeait
des couches (poids, TVA dans le socle) — refait avec un schéma en couches + ER.

### Décision de fond : event sourcing

**PM** — On pourra **rejouer l'historique** du catalogue et savoir qui a changé quoi, quand — sans
alourdir les fiches produit avec des colonnes techniques.

**Tech** — Le log d'events devient la **source de vérité** ; les tables sont des **projections**
reconstructibles. Conséquence directe : **suppression des `created_at`/`updated_at`** du modèle — le
« qui / quand / version » vit sur l'event. `status` devient une projection d'events.
→ ADR-11. Reste à trancher : les **frontières d'agrégat** (D6).

> ⚠️ **Révisé le 2026-07-21** — décision rétrogradée en « event store *préparé, pas activé* » après
> la revue adversariale (voir l'entrée du jour 2). Les `created_at`/`updated_at` sont **conservés**
> en colonnes système hors-domaine.

### Nutrition & allergènes

**PM** — La fiche réglementaire minimale est définie : **allergènes obligatoires**, et en option les
calories, la répartition glucides / lipides / protéines, et l'indice glycémique.

**Tech** — `NutritionInfo` rattachée au produit, valeurs **pour 100 g**. `allergens` requis (`[]` =
déclaration positive « aucun »). Invariant : **pas de publication sans allergènes déclarés**.
→ [`data-model/03-nutrition.md`](./data-model/03-nutrition.md)

### Base de données : Prisma + Postgres local

**PM** — On a une vraie base de données, **gratuite et locale**, identique à celle qui tournera en
production. Plus besoin de compte en ligne pour développer.

**Tech** — **Prisma 7** dans `src/infra/database/`. Trois pièges traversés : le client généré est du
**TS source ESM** (placé dans `src/` pour être compilé), il utilise `import.meta` (→ **Jest passé en
ESM**), et Prisma 7 exige un **driver adapter** (`@prisma/adapter-pg`, cohérent avec un serveur
long-running). Postgres **17** en Docker (`pnpm dev:infra`) sur le port **5433** (5432 déjà occupé).
Connexion validée de bout en bout.

### Authentification : Auth0

**PM** — La connexion est **déléguée à un service éprouvé** : aucun mot de passe à stocker ni à
sécuriser nous-mêmes. Le free tier couvre très largement nos besoins (l'équipe interne, pas les
clients B2C — eux passent par Shopify).

**Tech** — `src/infra/auth/` : vérification des JWT RS256 contre le JWKS du tenant avec **`jose`**
(pas Passport — ESM natif, testable). Guard **global** → API **protégée par défaut**, ouverture
explicite via `@Public()`. Fail-fast si la config Auth0 manque. Tests d'intégration sur une mini-app
Nest. → [ADR-12](./adr.md#adr-12--authentification-déléguée-à-auth0-vérifiée-avec-jose)

### Durcissement du jeu de flags TypeScript

**PM** — Revue du filet de sécurité : il paraissait plus maigre que sur l'autre projet. Vérification
faite, l'essentiel était déjà là, mais deux vraies failles ont été comblées et le filet a été **resserré
au-delà** de la référence. Concrètement : moins de bugs qui passent en production.

**Tech** — Diff réel avec SH3PHERD : sur 11 flags « manquants », **6 étaient déjà actifs** (impliqués
par `strict`), 2 étaient des défauts TS, 1 avait été déplacé dans la couche backend — et **2 étaient de
vrais trous** : `noImplicitReturns` et `allowUnusedLabels: false`. Comblés, puis ajout de
**`exactOptionalPropertyTypes`** et **`noUncheckedSideEffectImports`** (absents de SH3), et épinglage
explicite des flags impliqués par `strict`. **`erasableSyntaxOnly` délibérément écarté** : il casserait
Nest (parameter properties + enums). Build, lint et 17 tests verts — le client Prisma généré passe la
barre sans concession. → [ADR-10](./adr.md#adr-10--backend-esm--flags-ts-stricts-partagés)

---

### État à la fin du jour 1

| | |
|---|---|
| **Ça tourne** | front + back démarrent, Postgres local, 17 tests verts, lint + build propres |
| **Ça n'existe pas encore** | aucun modèle Prisma, aucune route métier, aucun écran |
| **Bloqueurs** | **D6** (frontières d'agrégat) bloque le schéma Prisma ; **D4** (accès PI Helios) reste l'inconnue n°1 |
| **À faire côté Hugo** | créer le tenant Auth0 + l'API, renseigner `AUTH0_DOMAIN` / `AUTH0_AUDIENCE` |

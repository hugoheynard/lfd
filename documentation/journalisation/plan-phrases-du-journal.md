# Plan — chaque ligne du journal se lit comme une phrase, sans rien perdre

> **Ouvert le 2026-09-19** à la demande de Hugo : « sans perdre d'information,
> toute phrase du journal devrait être humainement compréhensible ». Il prend
> la section « Les phrases » de [`todo-journal-activite.md`](todo-journal-activite.md).
>
> État : 🚧 **plan validé par Hugo le 2026-09-19 ; lots A, B et C bâtis, lot D à venir.** Le fonctionnement actuel du journal est
> dans [`architecture-journalisation.md`](architecture-journalisation.md).

## 0. Ce qu'on veut, en une phrase par exigence

1. **Aucun type brut à l'écran.** `product.identity_saved` n'est pas une
   phrase ; « Colette a modifié la fiche « Tarte citron » : nom, description »
   en est une.
2. **Rien de la charge ne se perd.** La phrase dit l'essentiel ; tout le reste
   de la charge est rendu en clair dessous (montants en euros, taux en %, dates
   en français, avant → après). Un champ qu'on ne sait pas nommer est un échec
   de test, pas une ligne muette.
3. **Des noms, pas des identifiants.** « la famille cat_01J… » ne dit rien ;
   « la famille « Tartes » » dit tout.
4. **Par construction, pas par relecture** : un type sans phrase, ou une clé
   sans libellé, ne passe pas la CI.

## 1. Ce qui existe (vérifié le 2026-09-19)

| Fait                                                                                                                                                                                                                                              | Où                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Les phrases vivent dans un `switch` de **dix cas** (taux de TVA, `order.placed`, publication d'un produit, note client), plus deux replis (tarification, réglages) ; sinon l'écran rend **le type lui-même**                                      | apps/lfc-B2B-admin-frontend/src/app/shared/journal-fact.ts (`factSentence`)                              |
| Les faits de l'équipe ont leur propre rendu (titre + phrase à la voix active)                                                                                                                                                                     | admin/journal/staff-line.ts, appelé par `journal-line.ts`                                                |
| Trois écrans lisent ces phrases : le Journal, l'onglet Historique d'une fiche produit, et (par ses propres résumés) le panneau tarifaire                                                                                                          | `journal-line.ts`, `product-history.ts`, `b2b/tarification/journal-panel/` (qui affiche `entry.summary`) |
| La ligne servie porte `actorName` et `actorRole` figés, `subjectType`, `subjectId` et la **charge brute** — **aucun libellé du sujet**                                                                                                            | `packages/contracts/src/activity-journal.ts` (`ActivityEventView`)                                       |
| La fonction de l'auteur est **déjà** affichée à côté de son nom (« Cécile (Commercial) ») : le point du TODO est clos                                                                                                                             | `journal-line.ts` (`actorOf`)                                                                            |
| Les types sont déclarés dans **au moins cinq** fichiers de constantes (`ACCOUNT_FACTS`, `PIM_EVENTS`, `ACTIVITY_TYPES`, les actes tarifaires composés sujet × verbe, les faits de l'annuaire) et en dur dans une vingtaine de classes d'événement | `grep journalFact()` : 24 fichiers hors tests                                                            |
| Ordre de grandeur : **~150 types**, dont une dizaine a une phrase                                                                                                                                                                                 | inventaire d'`Explore`, **approximatif** — le lot A le rend exact (§3)                                   |
| Des faits ne portent que des **identifiants** : `product_category.moved` et `product.reclassified` (`{ from, to }` = ids de familles), `company.declared` (`ownerUserId`), l'audience d'une règle tarifaire                                       | charges, voir §4                                                                                         |
| `staff_user.reinstated` couvre aussi la **première** activation d'une fiche en attente : « a rétabli l'accès » est faux dans ce cas                                                                                                               | `staff-facts.ts`                                                                                         |

⚠️ L'inventaire exact n'existe pas aujourd'hui, et c'est le premier problème :
**on ne peut pas garantir une phrase par type sans une liste des types.** Ce
plan ne recopie donc pas une liste faite de lecture — il la fait produire par
le code (lot A).

## 2. Les décisions de conception

### D1 — Un catalogue des faits, dans les contrats

`@lfd/contracts` gagne `JOURNAL_FACTS` : **chaque type** avec le schéma zod de
sa charge. C'est la seule liste ; les constantes des contextes la
référencent au lieu de redéclarer des chaînes.

Pourquoi un schéma et pas seulement un nom : l'exigence 2 (« rien ne se
perd ») demande de connaître les **clés** de chaque charge. Sans schéma, le
front ne sait pas ce qu'il doit rendre ; il ne peut que rendre ce qu'il connaît.

Les types **retirés** (qui ne s'écrivent plus mais existent en base, ex.
`company.kbis_uploaded_by_staff`, renommé le 2026-09-19) restent au catalogue,
marqués `retired`, avec leur phrase : une ligne de 2026 doit rester lisible
en 2028.

### D2 — La vérification à l'écriture : stricte en test, jamais bloquante en production

Le journal vérifie chaque fait contre le catalogue au moment de l'écrire.

- **en test (unitaire et e2e)** : un type inconnu ou une charge non conforme
  **lève**. C'est ce qui rend le catalogue exact : tout fait écrit par un
  test y est confronté.
- **en production** : il **journalise l'écart en erreur et écrit quand même**.
  Le journal est dans la transaction du geste (`recordOrFail`) : une charge mal
  décrite ne doit pas annuler une commande réelle. Un catalogue en retard est
  un défaut d'affichage, pas une panne.

Le mode se lit par `AppConfig`, jamais par `process.env`.

### D3 — Une phrase par type, exhaustive par le typage

Le front remplace le `switch` par un `Record<JournalFactType, Phrase>` : un
type ajouté au catalogue **ne compile pas** tant qu'il n'a pas sa phrase —
le même mécanisme que `MODULE_LABELS`.

Une `Phrase` rend des **segments** (texte, nom en gras, montant, lien vers le
sujet) et non une chaîne : c'est ce qui permet les noms en gras sans
`innerHTML`, et le lien vers la fiche.

### D4 — Rien ne se perd : la phrase déclare ce qu'elle consomme

Chaque phrase déclare les clés de la charge qu'elle a **dites**. Tout le
reste est rendu automatiquement dans un **détail** sous la phrase, clé par
clé, avec :

- un **dictionnaire de libellés** par nom de clé (`vatRatePercent` → « Taux de
  TVA », `priceMillicents` → « Prix HT »…) ;
- des **formateurs par unité**, déduits du schéma (centimes, millicentimes,
  points de base, pourcentage, date, booléen, liste de champs changés,
  avant → après).

Un test parcourt le catalogue : pour chaque type, une charge d'exemple tirée
du schéma est rendue, et **toute clé sans libellé ni consommation échoue**.
L'exigence 2 est donc tenue par construction, pas par relecture.

### D5 — Des noms figés à l'écriture, pas résolus à la lecture

Un fait qui cite un objet par son id cite **aussi son libellé du moment**
(`{ from: { id, name }, to: { id, name } }`). C'est la règle que le journal
applique déjà à l'auteur (`actorName` figé) et au client (`clientName`) :
le journal dit ce qui était vrai **quand** c'est arrivé. Une famille
renommée depuis doit se lire sous son ancien nom — c'est ce qu'on a vu.

La résolution à la lecture est écartée : elle ment sur le passé (le nom
d'aujourd'hui), elle coûte une jointure par ligne, et elle traverse les
frontières (le journal lirait les tables du PIM).

**Les lignes déjà en base** gardent leurs ids : leur phrase dit « une famille
(identifiant cat_…) » plutôt que d'inventer un nom. Aucune réécriture de
l'historique.

### D6 — Le sujet de la ligne a un nom

Chaque fait porte le **libellé de son sujet** figé (le nom de la fiche, du
client, de la personne), dans une clé conventionnelle de la charge,
`subjectLabel`. Pas de colonne nouvelle : la recherche lit déjà les valeurs de
la charge (lot 2 du plan précédent), et une colonne demanderait une
migration pour un gain nul.

### D7 — La première activation a son propre fait

`staff_user.activated` (de `pending`/`invited` vers `active`) se sépare de
`staff_user.reinstated` (de `suspended` vers `active`). Les lignes déjà en
base restent `reinstated` : leur phrase dit « a activé ou rétabli l'accès »,
ce qui est vrai des deux.

## 3. Les lots

### Lot A — ~~Le catalogue et sa vérification (API + contrats)~~ — fait le 2026-09-19 (`9c3c2d35`)

> 190 types (186 actifs, 4 retirés), par famille : référentiel-catalogue
> 30/1, référentiel-réglages 32/0, commerce 17/0, comptes-paniers 38/2,
> commandes-production 23/0, tarification 18/0, comptabilité 16/0, équipe
> 12/1. Sept types ne sont écrits par **aucun** test (`variant.aligned`,
> `appointment.honored`, `appointment.no_show`, `delivery_zone.removed`,
> `order_cutoff.updated`, `volume_commitment.closed`,
> `legal_entity.pre_notification_changed`) : leurs schémas viennent de la
> lecture du code. Reste : le déployer.

- `JOURNAL_FACTS` dans `@lfd/contracts`, rempli **par le code** : chaque
  classe d'événement et chaque constante référence son entrée.
- La vérification D2 dans l'adaptateur du journal (écriture bloquante et
  best-effort) ; strict sous le harnais de test.
- Toutes les suites unitaires et e2e passent **sous le mode strict** : chaque
  échec est une entrée manquante ou une charge mal décrite, corrigée dans le
  catalogue.
- Une porte ou un test : chaque constante de type du backend figure au
  catalogue (les deux ne peuvent plus diverger).

C'est le lot qui rend l'inventaire exact. Il ne change rien à l'écran.

### Lot B — ~~Les noms figés (API)~~ — fait le 2026-09-19 (`cb67bb63`)

> Reste : le déployer. Écarts assumés : `product.ingredients_saved` ne nomme pas
> la fiche (les ingrédients ne lisent pas le catalogue) ; les dérogations
> d'accès gardent leur e-mail ([`todo-derogations-d-acces.md`](todo-derogations-d-acces.md)) ;
> `staff_user.identity_edited` garde l'avant/après complet, e-mail et téléphone
> du staff compris — décision de Hugo du 2026-09-18
> (`../staff/journalisation-staff/architecture-journal-de-l-annuaire.md`).

> **Relevé par le lot A, à traiter ici** :
>
> - **des e-mails en clair** dans `user.registered`, `lead.captured` et
>   `feature_access.exemption_*` — contraire à la règle « jamais de
>   coordonnées » ;
> - des clés ambiguës : `delivery_zone.postalPrefixes` est un nombre ;
>   `appointment.honored/no_show.reason` recopie le motif d'annulation ;
>   `point_of_sale.updated.contexts` est une chaîne là où la création a un
>   tableau ; `ingredient.created.appellation` (un code) contre
>   `updated.appellationId` (un id), même écart pour `allergen_entry` ;
> - le `summary` tarifaire fige des ids bruts (« famille cat_… »,
>   l'audience) ;
> - `feature_access.*` et `company_mercuriale.*` n'ont pas de module à
>   l'écran.

- D5 sur chaque fait qui ne cite que des ids (liste produite par le lot A :
  les schémas disent quelles clés sont des ids nus).
- D6 : `subjectLabel` sur chaque fait.
- D7 : `staff_user.activated`.
- e2e : pour chaque fait touché, le libellé est celui **du moment** (renommer
  l'objet après coup ne change pas la ligne).

### Lot C — ~~Le moteur de phrases (back-office)~~ — fait le 2026-09-19 (`f66cb8bb`)

> 51 types sur 191 ont une phrase ; les 140 autres sont figés dans
> `phrase-registry.spec.ts` pour le lot D. Le panneau tarifaire garde ses
> résumés figés (§4) : il n'est pas branché, contrairement à ce que disait
> la première version de ce lot. Relevé pour le lot D : les **valeurs**
> d'énumération s'affichent brutes (`write`, `takeaway`) — il faut un
> dictionnaire de valeurs ; la portée d'un fait (`blast.families`) n'est plus
> lue par la méta de la ligne. Reste : le déployer, et un passage à l'écran.

- `Phrase` en segments, le `Record` exhaustif, le détail automatique D4, le
  dictionnaire de libellés et les formateurs d'unités.
- Le rendu (gras, montants, lien vers le sujet) dans les trois écrans :
  Journal, Historique produit, panneau tarifaire.
- Les phrases de l'équipe (staff-line.ts) passent dans le même moteur.

### Lot D — Les phrases, famille par famille (back-office)

Une instance par famille de préfixes, en parallèle : référentiel, commerce et
catalogue, comptes et paniers, commandes et production, tarification,
comptabilité, équipe. Chaque phrase à la voix active, au passé composé,
avec l'auteur en sujet quand il est connu (« Colette a passé le taux à
emporter de « Tartes » de 5,5 % à 10 % »).

Le lot se termine quand le `Record` compile : c'est le typage qui dit qu'il
ne manque rien.

## 4. Ce qui n'est pas proposé

- **Réécrire les lignes anciennes** pour y ajouter des noms : le journal ne
  se réécrit pas, sauf pour renommer un type (CLAUDE.md §8, exception des
  valeurs du journal). Leurs phrases disent ce qu'elles savent.
- **Des phrases côté serveur** : l'écran les compose, dans la langue de
  l'écran ; l'API sert des faits. Le jour où un second consommateur (un
  export, un e-mail) en aura besoin, le moteur se déplacera dans un paquet
  partagé.
- **Le panneau tarifaire** garde ses résumés figés à la pose (`summary`) :
  ils sont déjà des phrases, écrites au moment du geste.

## 5. Vérifications

- Lot A : les suites complètes, **en mode strict**, vertes.
- Lot B : un e2e par fait nommé, qui renomme l'objet après coup.
- Lots C et D : le test du catalogue (chaque type rendu, chaque clé nommée),
  les specs des trois écrans, le build AOT, et un passage à l'écran sur un
  jeu de faits de chaque famille.

## 6. Décisions de Hugo (2026-09-19)

1. **D2 — oui** : en production, un fait mal décrit s'écrit quand même, avec
   une erreur au journal applicatif ; jamais un geste bloqué pour un défaut
   de description.
2. **D5 — oui** : les lignes anciennes qui ne portent qu'un identifiant
   affichent « une famille (identifiant …) », pas un nom résolu aujourd'hui.

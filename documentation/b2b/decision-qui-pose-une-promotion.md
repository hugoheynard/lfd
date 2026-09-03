# Qui pose une promotion — et pourquoi ce n'est pas le référentiel

**Ouvert le 2026-09-03.** Décision prise en réponse à une intention produit :
« le PIM doit aussi gérer les promotions sur catalogue, on a déjà l'écran », les
commerciaux ne faisant « que surcouche et changement du prix de base avec la
mercuriale ».

Puis, dans la même discussion, d'une proposition plus large : **remonter toute
l'édition au référentiel**, la faire voyager vers la plateforme qui s'en sert
pour calculer, et **sortir le noyau de résolution en paquet partagé** — l'objectif
étant de pouvoir **mapper les promotions par canal**. C'est cette seconde
proposition que le §5 pèse, et elle change le verdict.

> Le chantier boutique : [`plan-boutique-sur-api.md`](plan-boutique-sur-api.md).
> Le moteur : [`architecture-resolution-de-prix.md`](architecture-resolution-de-prix.md).
> Ce que la boutique montre : [`architecture-prix-boutique.md`](architecture-prix-boutique.md).

> Ce document touche **l'argent** et une **frontière de droits**. Chaque
> affirmation qu'il fait de l'existant a été ouverte dans le dépôt ; la table
> du §8 dit laquelle et où.

---

## 1. La promotion existe déjà, et elle est complète

`PRICE_STAGES = ["mercuriale", "volume", "promotion", "geste"]`. La promotion
n'est pas un étage à construire : c'est le troisième, et il est servi.

| Pièce               | Où                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Le modèle           | `PriceRule` — étage, nature, portée, audience, fenêtre, plancher                            |
| La garantie         | `price_rules_no_overlap`, contrainte d'**exclusion** GiST                                   |
| Le moteur           | `resolvePrice()` — composition, un seul arrondi, scellement                                 |
| L'écran             | `b2b/tarification/` — `rule-panel`, `simulateur`, `price-path`, `frise`, `overlap-timeline` |
| La route d'écriture | `POST /admin/pricing/rules`                                                                 |
| La trace            | `GET /admin/pricing/journal`                                                                |

Il n'y a rien à bâtir. La question n'est pas _comment poser une promotion_, mais
**qui**.

## 2. La répartition décrite est juste — et déjà exprimable

Elle se lit entièrement sur l'**audience** d'une règle :

| Ce qui est décrit                       | `stage`      | `audienceType`        | `scopeType`            |
| --------------------------------------- | ------------ | --------------------- | ---------------------- |
| Changement du prix de base (mercuriale) | `mercuriale` | `company`             | `product` / `variant`  |
| Surcouche commerciale                   | `geste`      | `company` / `segment` | selon le geste         |
| **Promotion catalogue**                 | `promotion`  | **`all`**             | `category` / `product` |

C'est une **découpe d'audience**, pas une découpe de contexte borné. Elle se
tient par des **droits**, pas par un déplacement de données.

## 3. Ce qui résiste à un déplacement vers le référentiel

Trois obstacles, par force décroissante. Le **§5 les rouvre un par un** : deux
cadrent le déplacement au lieu de l'interdire, un tombe. Ils sont énoncés ici
d'abord parce qu'ils décident de la FORME du déplacement.

### a. Une promotion doit savoir ce qu'est un compte négocié

`PriceRule.stacksOverMercuriale` pose une question commerciale explicite : « oui,
cette promotion vise aussi les comptes au tarif négocié ». Le drapeau existe
parce que le cumul silencieux avait déjà eu lieu — un compte sous mercuriale
empochait _aussi_ la promotion publique, « un cumul que personne n'avait décidé,
qui ne se lisait nulle part, et qui ne se découvrait qu'en comparant deux
factures » (fermé le 2026-08-18).

Le référentiel **ne connaît pas les sociétés** : la matrice de `CLAUDE.md` §3
interdit `pim → b2b`. Une promotion écrite là-bas ne pourrait pas répondre à la
question que ce champ pose ; elle arriverait avec le défaut `false`. Une décision
commerciale prise par omission est exactement ce que le drapeau a été créé pour
empêcher.

### b. Le déterminisme est garanti par une contrainte d'insertion

`price_rules_no_overlap` rend **impossibles** deux règles également spécifiques
valides au même instant — sans elle, « le prix dépendrait de l'ordre de tri, donc
du hasard ».

Un second écrivain **asynchrone** (le PIM pousse, la plateforme ingère) ne
supprime pas la garantie : il en **déplace le refus**. La promotion serait
rejetée à l'ingestion, pas à la saisie, et son auteur ne serait plus devant
l'écran. C'est le mode de panne que le lot 3 du plan boutique nomme déjà pour
l'éditorial — ici appliqué à un prix.

### c. Le contrat du fil dit l'inverse, et le dit explicitement

`syncVariantSchema.priceMillicents` : le prix poussé est « le tarif de référence
**pré-altération** […] les étages de la résolution de prix (mercuriale, volume,
promo) viennent encore au-dessus. **Rien de tout cela ne remonte jamais ici.** »

L'inverser reste possible — mais c'est un **renversement** à assumer et à écrire,
pas un ajout.

## 4. Deux choses se cachent sous « promotion », une seule est un prix

|                    | Ce que c'est                                          | Où ça vit                                        | État                                                |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------- |
| **Promotion-prix** | −15 % sur les viennoiseries du 1<sup>er</sup> au 20   | `PriceRule` étage `promotion`, audience `all`    | ✅ complet                                          |
| **Mise en avant**  | le produit en tête de rayon, un bandeau, une histoire | `CatalogItemOverride.isFeatured` + éditorial PIM | 🟡 la colonne existe, **l'éditorial ne voyage pas** |

Des communicants veulent très probablement les **deux**. La seconde est un vrai
manque — et elle est déjà planifiée : c'est le **lot 3** du plan boutique
(« l'éditorial voyage »), qui n'a rien à voir avec la tarification.

## 5. Deux architectures, et le multicanal les départage

### Option A — la règle reste au B2B, seul l'écran bouge

Le back-office est **une seule application Angular** qui porte `src/app/pim/` et
`src/app/b2b/`. Un onglet « Promotions » dans la fiche produit du référentiel qui
appelle `POST /admin/pricing/rules` est une **composition de front** : même
session, même mur, autre API. Étage figé à `promotion`, audience figée à `all`,
`rule-panel` réutilisé.

On obtient « le référentiel gère les promotions catalogue » comme **fait
d'usage**, sans inverser un flux de données ni dupliquer un moteur.

**Coût :** un panneau restreint. **Ce qu'elle ne résout pas :** rien du
multicanal.

### Option B — l'autorité passe au référentiel, la plateforme miroite et résout

La promotion catalogue devient une donnée du référentiel, voyage dans
l'instantané, et la plateforme la reçoit comme elle reçoit déjà les articles. Le
noyau de résolution sort en paquet partagé.

**C'est le seul chemin qui répond au multicanal**, et le multicanal est un vrai
manque : `PriceRule` n'a **aucune dimension canal**, `PricingContext` non plus, et
le canal Shopify pousse déjà des prix — le canonique seul. Une campagne qui doit
tourner sur la boutique **et** le B2B se pose donc aujourd'hui deux fois, dans
deux systèmes, sans fenêtre commune ni auteur commun. Aucun écran ne peut dire
« voici la campagne de rentrée » : elle n'existe nulle part comme objet.

#### Pourquoi le §3 ne la disqualifie pas

Les trois objections ont été écrites contre « le référentiel possède la
promotion ». Deux tiennent, une tombe :

- **§3a (l'audience) tient, et elle CADRE l'option.** Le référentiel ne peut pas
  porter `audienceType: company` — il ne connaît pas les sociétés. Le partage
  doit donc se faire **sur l'audience** : `all` au référentiel, `company` et
  `segment` à la plateforme. Ce n'est pas une restriction subie, c'est la
  frontière elle-même.
- **§3b (le refus asynchrone) tombe**, à une condition. La contrainte
  `price_rules_no_overlap` continue de tout voir **si les règles miroitées
  atterrissent dans la même table `price_rules`** — exactement comme
  `catalog_items` miroite le référentiel. Et une collision entre les deux
  origines est impossible par construction : `audience: company` est strictement
  plus spécifique que `audience: all`, donc deux règles d'origines différentes ne
  sont jamais **également** spécifiques. Le seul cas de collision restant est
  interne au référentiel, et une contrainte de son côté le couvre.
- **§3c (le contrat du fil) tient**, mais c'est un renversement assumable — il
  s'écrit, comme celui des mentions d'allergènes en v4.

#### Les trois difficultés réelles

1. 🔴 **Le référentiel ne peut pas montrer l'effet de ce qu'il écrit.** Le prix
   canonique effectif est `CatalogItemOverride.priceMillicents` — une donnée de
   la plateforme — et le plancher **est la marge**, que le §« ce qui ne franchit
   pas la frontière » du plan boutique interdit de sortir. Le `simulateur`
   d'aujourd'hui devient impossible côté référentiel. **Une promotion écrite à
   l'aveugle sur un prix qu'on ne voit pas est le risque principal de l'option.**
2. **Le plancher peut rogner en silence.** Une promotion posée au référentiel
   peut être écrêtée par un plancher de la plateforme que son auteur ne voit pas.
   Sans remontée dans la boîte de réception, on reconstruit exactement le mode de
   panne que §3b évitait — la décision refusée loin de qui l'a prise.
3. **`channelId` n'existe nulle part.** L'ajouter est additif sur le modèle, mais
   il doit **entrer dans la clé d'exclusion** — sans quoi deux promotions
   identiques sur deux canaux différents resteraient impossibles à insérer. C'est
   une migration de contrainte **sur la table qui facture** : trois déploiements,
   étendre / basculer / resserrer.

#### Le paquet partagé

`resolve-price.ts`, `specificity.ts`, `floor-policy.ts`, `volume-ladder.ts` sont
**purs** — ni Nest, ni Prisma, ni HTTP. Ils sortent en `@lfd/pricing` sans
difficulté technique.

⚠️ Mais `PricingContext` porte `companyId`, `segmentId`, `cumulativeQuantity` :
du **commerce**. Le paquet exporte donc le **noyau** — composition, spécificité,
plancher — pendant que le contexte reste à la plateforme. C'est une frontière
propre, et c'est la seule qui évite le `shared-types` que `CLAUDE.md` §1 refuse.

## 6. La décision

**A si le multicanal n'est pas un besoin réel. B s'il l'est — et pas maintenant.**

Le critère est unique et il se pose à des humains, pas au code : _une campagne
doit-elle tourner sur la boutique Shopify et le B2B en même temps, avec la même
fenêtre et le même auteur ?_ Si oui, A est un pansement qui devra être défait, et
B est la bonne cible. Si non, B coûte une migration de contrainte sur la table
qui facture pour un bénéfice théorique.

**Dans les deux cas, pas avant les lots 1 et 2 du plan boutique.** Déplacer
l'autorité d'un prix que la seule surface en ligne n'affiche pas encore, c'est
migrer à l'aveugle : il n'y aurait aucun écran pour montrer qu'on s'est trompé.
L'ordre reste « l'argent cesse d'avoir deux sources », puis l'autorité.

⚠️ **Si B est retenue, la difficulté n°1 se traite AVANT le reste.** Un écran qui
pose des promotions sans montrer le prix obtenu est plus dangereux qu'un écran
qui n'existe pas.

## 7. 🔴 Le manque commun aux deux options : la ressource n'est pas assez fine

Il y a cinq rôles : `admin`, `commercial`, `comptabilite`, `support`, `dev`.
**Aucun ne décrit un communicant** — quelqu'un qui édite le catalogue et pose des
promotions publiques sans jamais toucher au prix d'un compte nommé.

Aujourd'hui `commercial` porte `b2b_pricing: "write"` et `pim_catalog: "read"`.
Donner la promotion aux communicants par les droits existants revient à leur
donner `b2b_pricing: write`, c'est-à-dire **aussi le pouvoir de poser une
mercuriale sur un compte** — l'exact inverse de la répartition voulue.

**`b2b_pricing` ne distingue pas l'audience.** Deux sorties :

1. une ressource **`b2b_promotions`** (étage `promotion`, audience `all`)
   détachée de `b2b_pricing`, et un rôle `communication` qui porte
   `pim_catalog: write` + `b2b_promotions: write` ;
2. rien, et les communicants passent par un commercial.

La première est cohérente avec le découpage déjà fait : `pim_catalog` et
`b2b_catalog` ont été séparés pour cette raison exacte — « l'un dit ce qui
existe, l'autre ce qui est en vente ». Sous l'option B, la ressource se nomme
côté référentiel, mais la question est la même.

⚠️ Un droit ne se découpe pas à moitié. Tant que la ressource n'existe pas, tout
panneau de promotion reste derrière `b2b_pricing` : une restriction posée
seulement dans l'UI n'est pas un mur.

## 8. Ce que ça change au plan boutique

**Rien aux lots 1 et 2**, sous l'une comme sous l'autre. Le lot 1 sert le prix
**résolu** au client : une promotion catalogue y est déjà présente, parce que le
moteur l'applique. Il n'y a pas de champ « promotion » à ajouter à la vue client
— le prix barré la montre déjà, et `stacksOverMercuriale` décide seul si un
client sous mercuriale la voit.

## 9. Ce qui a été vérifié, et où

| Affirmation                                              | Vérifiée par                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| `promotion` est un étage servi                           | `pricing/domain/price-rule.ts:21` (`PRICE_STAGES`)              |
| Le moteur compose et scelle                              | `pricing/domain/resolve-price.ts:25-80`                         |
| La non-superposition est une contrainte d'exclusion GiST | `schema.prisma`, modèle `PriceRule` (`price_rules_no_overlap`)  |
| `stacksOverMercuriale` existe et vaut `false` par défaut | `schema.prisma`, modèle `PriceRule`                             |
| La route de création existe                              | `pricing/http/admin-pricing.controller.ts:221`                  |
| L'écran de saisie existe                                 | `lfc-B2B-admin-frontend/src/app/b2b/tarification/rule-panel/`   |
| Le prix poussé est pré-altération                        | `packages/catalog-sync/src/snapshot.ts`, `syncVariantSchema`    |
| Le référentiel ne connaît pas les sociétés               | `CLAUDE.md` §3, matrice `pim → b2b` = ✗                         |
| Cinq rôles, aucun « communication »                      | `packages/contracts/src/staff-access.ts:170-174`                |
| `commercial` = `b2b_pricing: write`, `pim_catalog: read` | `packages/contracts/src/staff-access.ts:275-303`                |
| `isFeatured` existe déjà sur le miroir                   | `schema.prisma`, modèle `CatalogItemOverride`                   |
| Le back-office est une seule app                         | `lfc-B2B-admin-frontend/src/app/{pim,b2b}/`                     |
| `PriceRule` n'a **aucune** dimension canal               | `pricing/domain/price-rule.ts` — aucune occurrence de `channel` |
| `PricingContext` non plus                                | `pricing/domain/price-rule.ts:184-209`                          |
| Le canal Shopify pousse des prix (canonique seul)        | `pim/channels/shopify/products/projection.ts:119`               |
| Le noyau de résolution est pur                           | `pricing/domain/{resolve-price,specificity,floor-policy}.ts`    |
| `PricingContext` porte du commerce                       | `companyId`, `segmentId`, `cumulativeQuantity` (mêmes lignes)   |

⚠️ **Ce document n'a pas été soumis à un contradicteur.** `CLAUDE.md` §9 bis le
demande pour tout plan qui touche l'argent ou une frontière de sécurité — et
celui-ci touche les deux. À défaut, chaque affirmation de l'existant a été
ouverte dans le dépôt. Ça remplace la mémoire, pas la contradiction.

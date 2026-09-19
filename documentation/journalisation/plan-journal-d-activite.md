# Plan — ce qui reste à faire sur le journal d'activité

> **Ouvert le 2026-09-18** à la demande de Hugo : « regarde le todo de journal
> d'activité et propose-moi un plan pour tout sauf les phrases formulation ».
> Il couvre les points de [`todo-journal-activite.md`](todo-journal-activite.md)
> sauf les phrases. Les numéros « §1 » à « §10 » cités ci-dessous sont ceux du
> TODO **avant son ménage du 2026-09-19** ; le TODO ne garde plus qu'un renvoi
> par lot.
>
> **Convention (Hugo, 2026-09-19)** : **ce plan seul suit l'avancement**. Un
> point se raye ici au moment où il est fait, avec sa date et son commit ; le
> TODO n'en garde qu'une ligne de renvoi, et l'efface quand le lot est livré.
>
> État : 🚧 **lots 2, 3 et 5 bâtis le 2026-09-19** (le 2 en premier, à la
> demande de Hugo), à déployer après la sortie d'Accelerate. **Lot 1 en
> cours.** Lot 4 : attend la décision de la permission.
> **Deuxième version**, réécrite après une
> contradiction de `vitruve` (§8) qui a cassé l'inventaire, la porte étendue,
> la colonne de recherche et le déménagement du code.
>
> Le fonctionnement actuel du journal est dans
> [`architecture-journalisation.md`](architecture-journalisation.md) ; ce plan
> ne le répète pas.

## 0. Résumé

| Lot | Point du TODO | Ce qu'il livre                                                                                                                                                                                     | Coût   |
| --- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | §1            | les **actes du staff** qui touchent l'argent ou la production entrent au journal ; la porte s'étend à leurs dossiers                                                                               | moyen  |
| 2   | §4, §7        | ~~le filtre par personne a son index ; la recherche ignore les clés et les accents~~ — **bâti le 2026-09-19**, déploiement en attente                                                              | faible |
| 3   | §5, §9        | ~~on arrive au journal depuis une fiche staff ; la fiche produit a son onglet « Historique »~~ — **bâti le 2026-09-19** (`b12433c3`, `83589b95`, et le commit de l'onglet), déploiement en attente | moyen  |
| 4   | §6            | la comptabilité relit **tout ce qu'elle écrit** sur la fiscalité, et rien d'autre                                                                                                                  | moyen  |
| 5   | §10           | ~~les deux journaux se lisent par pages numérotées, sur une vue figée (`fold-paginator`)~~ — **bâti le 2026-09-19** (`9f20a980` et le commit d'écran), déploiement en attente                      | faible |
| —   | §3            | ~~le code reste en `growth`~~ — **fermé par Hugo le 2026-09-19** : ni la table ni le code ne bougent (`architecture-journalisation.md` §2)                                                         | —      |
| —   | §2            | « et aujourd'hui, ça touche quoi ? » — laissé au TODO, avec son déclencheur                                                                                                                        | —      |

**Deux décisions reviennent à Hugo** (§3) : faut-il journaliser les gestes
qu'un **client** fait sur son propre compte, et quelle **permission** ouvre la
tranche fiscale.

## 1. Ce qui existe (vérifié le 2026-09-18, revérifié par `vitruve`)

| Fait                                                                                                                                                                                                                          | Où                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Deux règles écrites** : un client qui agit sur son propre compte « n'engage que lui » et n'est pas journalisé ; le journal ne porte **jamais** l'e-mail ni le téléphone d'une personne                                      | `dev-toolbox/gates/journal-tracked.mjs:61-68`, `b2b/account/domain/events/staff-contact-acts.event.ts:7-11` |
| `lint:journal-tracked` couvre `pim/`, les actes du staff sur un compte (`b2b/account`, par le nom `…ByStaff`) et `staff/`. Il ne reconnaît que `publishTraced`, `journal.append`, le laissez-passer du PIM et `@sans-journal` | `journal-tracked.mjs:230-245`                                                                               |
| Sur `b2b/` + `production/` + `handover/` : 172 handlers ; la règle actuelle en refuserait **120**, dont beaucoup journalisent par un chemin qu'elle ne voit pas (`PricingActWriter`, délégation, abonné de croissance)        | simulation de `vitruve`                                                                                     |
| `activity_events` : trois index, **aucun sur `actor_id`** ; la recherche `q` est un `ILIKE` sur `actor_name` et `payload::text`                                                                                               | `growth.prisma`, `activity-journal.where.ts`                                                                |
| Trois migrations créent déjà une extension (`btree_gist`) : Prisma Postgres en accepte par migration                                                                                                                          | `20260817102602_regles_tarifaires/migration.sql:51` et deux autres                                          |
| L'écran Journal ne lit aucun paramètre d'URL                                                                                                                                                                                  | `admin/journal/journal-page.ts`                                                                             |
| `GET` sur une `@AdminSurface` exige `read` ; `pim_tax:read` est accordé à `commercial` et `dev`                                                                                                                               | `staff-access.guard.ts:23,113`, `staff-access.ts` (`ROLE_GRANTS`)                                           |
| Les faits fiscaux ne sont pas tous `vat_rate.*` : `product_category.vat_changed`, `product.vat_changed`, `accounting_rules.*` en sont aussi                                                                                   | `activity-module.ts`, `pim/accounting-rules/`                                                               |
| `legal_entity.`, `payment_mandate.`, `accounting_rules.`, `point_of_sale.` ne sont rangés sous **aucun** module de l'écran                                                                                                    | `activity-module.ts:12-41`                                                                                  |
| Le journal tarifaire rend un **tableau nu** ; seule la route par sujet a un appelant au front                                                                                                                                 | `admin-pricing-journal.controller.ts:27,38`, `tarification.service.ts:124`                                  |
| `order.ready`, `order.handed_over`, `order.placed` sont écrits par la croissance en **best-effort**, hors transaction                                                                                                         | `b2b/growth/application/handlers/on-order-*.handler.ts`                                                     |

**L'inventaire du §1, refait.** Échappent au journal, **parmi les actes du
staff** qui touchent ce qui est vendu, facturé ou produit :

| Geste                                                                           | Où                                                                                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| poser, retirer la **surtaxe de retard**                                         | `b2b/order-waivers/application/order-late-fee.handlers.ts`                                                                     |
| accorder, retirer une **dérogation d'heure limite**                             | `b2b/order-waivers/application/order-cutoff-waiver.handlers.ts`                                                                |
| changer le **RIB** d'une société (hors révocation d'un brouillon de mandat)     | `b2b/payments/`, `set-company-bank-account`                                                                                    |
| les **décisions de catalogue** : visibilité, mise en avant, prix B2B            | `b2b/catalog/application/commands/catalog-decision.handlers.ts`                                                                |
| **clore**, **reprendre** une journée de production                              | `production/application/commands/`                                                                                             |
| cocher, décocher une ligne **fabriquée** ou **emballée** ; compter les **bacs** | `production/application/commands/` — le JSDoc de `step-packing-containers` dit déjà « qui a appuyé se lirait dans le journal » |

Et **parmi les gestes du client sur son propre compte** — hors journal par une
règle écrite jusqu'au 2026-09-19 : ses paniers récurrents (créer, suspendre,
modifier une échéance, supprimer), son profil, son RIB, ses adresses, ses
membres.

## 2. Les lots

### Lot 1 — Les gestes qui échappent au journal, staff et clients (§1)

> **Décidé par Hugo le 2026-09-19** : les gestes du **client** sur son propre
> compte entrent aussi (§3, décision 1) ; les **brouillons** de commande et le
> **panier** restent hors journal (`@sans-journal` : ils ne vendent rien, la
> commande passée laisse sa trace) ; les **gestes d'atelier** (coches de ligne,
> bacs) sortent du lot et **restent au TODO**. La clôture et la reprise d'une
> journée de production, elles, restent dans le lot.
>
> **Tranches**, dans cet ordre, chacune avec ses faits, ses e2e et son entrée
> dans la porte : (a) l'argent — surtaxe, dérogations d'heure limite, RIB
> (staff et client) ; (b) les décisions de catalogue ; (c) les paniers
> récurrents et les autres gestes du client sur son compte ; (d) la journée de
> production.

- **Journaliser** les gestes du tableau ci-dessus, dans la transaction du
  geste (`Journal.append` ou `publishTraced`, sous `UnitOfWork`) : un fait par
  geste, l'avant et l'après quand il y en a un. Module : `commandes` pour la
  surtaxe et les dérogations (préfixes à ajouter), `commercial` pour les
  décisions de catalogue, un module **`production`** nouveau pour l'atelier.
- **Jamais de coordonnées** dans une charge : le RIB se journalise par ses
  **quatre derniers chiffres** et son titulaire, comme l'écran l'affiche — pas
  l'IBAN.
- ~~**Les gestes d'atelier**~~ — **sortis du lot** par Hugo le 2026-09-19,
  laissés au TODO (une ligne par coche en écrirait des centaines par
  journée).
- **La porte s'étend dossier par dossier, pas au bloc entier** :
  `b2b/order-waivers/`, `b2b/catalog/`, `b2b/payments/`, `production/`,
  `handover/` — chaque dossier entre quand **tous** ses handlers journalisent
  ou déclarent `@sans-journal <raison>`. La porte apprend à reconnaître
  `PricingActWriter` et les délégations nommées (`recordCompanyBankAccount`,
  `HandoverAttestation`), qui journalisent déjà. Le reste de `b2b/` reste hors
  zone : l'étendre en bloc aurait demandé une centaine de déclarations.
- **Les faits de commande** (`order.ready`, `order.handed_over`), aujourd'hui
  best-effort, **restent** tels quels dans ce lot : c'est un choix écrit de la
  croissance, et le changer demande de les passer dans la transaction du
  geste. Noté au TODO.

### Lot 2 — L'index de la personne, et une recherche qui ignore clés et accents (§4, §7)

- ~~**Un index sur `actor_id`**, par migration additive.~~ — **bâti le
  2026-09-19** (`f94471d9`, `20260919100000_index_de_l_auteur_du_journal`).
  **Reste : le déployer** hors des heures d'usage, après la sortie
  d'Accelerate, en comptant le volume juste avant — chaque geste opposable
  écrit dans cette table, et la construction bloque ses écritures.
- ~~**La recherche, sans colonne ni migration** : normalisée à la lecture, des
  deux côtés, sur les **valeurs** de la charge et le nom de l'auteur.~~ —
  **fait le 2026-09-19** (`4c9c95c6`). Corrigé en bâtissant : `translate()`
  **puis** `lower()`, majuscules accentuées dans la table — sous une locale
  `C`, `lower()` ne touche que l'ASCII, et l'ordre écrit ici plus haut
  laissait « É » intact. Les nombres sont lus aussi, pas seulement les
  chaînes.
- **Pas de colonne générée** : sa construction réécrirait la table sous un
  verrou qui bloque toutes les écritures opposables, et Prisma, qui ne la
  déclarerait pas, proposerait de la supprimer au prochain `migrate dev`.
- **Pas d'index trigramme** tant que la recherche reste rapide : `pg_trgm`
  est plausible (Prisma Postgres accepte `btree_gist`), mais un index sur une
  expression normalisée est une migration à part, déclenchée par la mesure.
- **Les montants** : stockés en centimes, ils ne se trouvent pas en tapant
  « 12,50 ». Dit, pas corrigé.
- **Rétention et partitionnement : pas maintenant**, avec un seuil écrit — un
  million de lignes, ou une page du journal au-delà de 500 ms. La requête de
  comptage entre au runbook.

### Lot 3 — ~~Arriver au journal depuis une fiche~~ (§5, §9) — bâti le 2026-09-19

> ✅ **Bâti le 2026-09-19** : filtres d'identifiants dans l'URL et « Voir son
> activité » (`b12433c3`) ; serveur de l'historique produit (`83589b95`) —
> route `GET /pim/catalogue/products/:id/history`, déclinaisons (`variant.*`)
> incluses sur décision de Hugo ; l'onglet dans le commit suivant, avec la
> nature de l'auteur (`actorType`) ajoutée au contrat pour qu'un nom absent ne
> se lise pas « le système ». **Reste** : déployer. Hors de l'onglet : une
> heure limite posée sur un produit (son sujet est la limite) — noté au TODO.

- **L'écran Journal lit ses filtres dans l'URL** — les **identifiants**
  seulement (`actorId`, `subjectType` + `subjectId`, `module`). **Pas `q`** :
  un terme cherché peut être nominatif, et l'URL voyage dans les journaux de la
  passerelle.
- **Fiche staff → « Voir son activité »**, affiché **seulement** à qui a
  `activity:read` — une dérogation `staff_access` sans `activity` ne doit pas
  mener à un `403`.
- **Fiche produit → onglet « Historique »**, sous les droits du référentiel.
  **Amendé le 2026-09-19** — Hugo : « tout doit être journalisé » : l'onglet
  montre **tout ce qui a touché le produit**, pas seulement ses faits propres.
  Trois cercles, dans une même chronologie, chacun marqué :
  1. **le produit lui-même** — les faits `product.*` dont il est le sujet ;
  2. **ce dont il hérite**, marqué « hérité » — les faits `product_category.*`
     de sa famille **et de ses ancêtres** (TVA, renommage, déplacement,
     archivage), les faits `vat_rate.*` des taux qu'il applique, les faits
     `ingredient.*` / `appellation.*` de ce qu'il déclare. Rattachés par ce que
     le produit porte **aujourd'hui** : un taux qu'il n'applique plus, une
     famille qu'il a quittée, n'y figurent pas — dit à l'écran ;
  3. **les révisions qui l'ont emporté** — `catalog_revision.taken` /
     `.pushed` dont la photo contient une de ses déclinaisons.

  **Hors de l'onglet** : les faits de la plateforme marchande sur ses SKU
  (décisions de catalogue, prix B2B — lot 1) vivent sous les droits du
  commerce ; l'onglet renvoie au journal filtré, pour qui a `activity:read`.
  Un fait d'un autre bloc qui porterait un sujet `product` ne s'y montre
  jamais : la lecture filtre par **préfixe** de type, pas seulement par sujet.

### Lot 4 — La tranche fiscale pour la comptabilité (§6)

- **Une seconde lecture**, bornée **au serveur** par une clause `AND` sur une
  **liste de types** — pas sur un module, qui ouvrirait tout le référentiel :
  `vat_rate.*`, `product_category.vat_changed`, `product.vat_changed`,
  `accounting_rules.*`. `q`, `subjectId`, le curseur et les autres filtres s'y
  ajoutent par `AND` : aucun ne peut élargir la tranche.
- **La permission est exigée explicitement** (`@RequirePermission`), jamais
  déduite du verbe : sinon un `GET` s'ouvrirait à tout porteur de
  `pim_tax:read` — `commercial` et `dev` compris.
- **Ranger les préfixes orphelins** (`legal_entity.`, `payment_mandate.`,
  `accounting_rules.`, `point_of_sale.`) sous un module de l'écran, dans le
  même lot.

### Lot 5 — ~~Les deux journaux se lisent par pages numérotées~~ (§10) — bâti le 2026-09-19

> ✅ **Bâti le 2026-09-19** : serveur `9f20a980`, écrans dans le commit
> suivant (`fold-paginator` sur l'écran Journal et le panneau du journal
> tarifaire, « Charger la suite » retiré). **Reste** : déployer (API d'abord,
> puis le back-office), puis **retirer l'ancienne route** au tableau nu au
> déploiement d'après. L'heure « Vue figée à hh:mm » est celle du navigateur à
> la réception de la page 1 : le contrat ne rend pas la date de l'ancre.

**Amendé le 2026-09-19 à la demande de Hugo** : « utilise un fold paginator »,
puis « il faut paginer le journal d'activité aussi ». Un `fold-paginator` exige
un **total** et un **numéro de page** : le curseur « charger la suite » prévu
ici ne suffisait pas.

- **Une vue figée** : sur un flux où les faits arrivent en tête, une page 2
  changerait entre deux clics — c'est pour ça que l'écran Journal paginait par
  curseur. La page 1 fixe donc une **ancre** (`asOf`, le fait le plus récent
  qui répond aux filtres) ; pages et total se comptent jusqu'à elle. Un fait
  arrivé depuis apparaît en revenant en page 1 ou en changeant de filtre.
- **Journal tarifaire** : route neuve `…/:subjectType/:subjectId/pages`
  (`PricingJournalPageView`, 20 par page) ; l'ancre est le couple
  (`occurred_at`, `id`) — l'`id` vient de l'horloge applicative, la date de la
  base. L'ancienne route au tableau nu reste, **dépréciée**, tant que le front
  en ligne la lit — **à retirer** au déploiement suivant celui du nouveau
  front.
- **Journal d'activité** : `page`, `total` et `asOf` s'ajoutent au contrat ; le
  curseur `before` reste servi pour la même raison. `page` et `before`
  ensemble : `400`.
- **Coût** : chaque page du journal d'activité fait une lecture d'ancre et un
  `count(*)` en plus — sous le seuil du lot 2 (500 ms) à surveiller.
- **La route des 50 derniers actes tarifaires**, sans appelant, n'est pas
  paginée : à retirer ou à brancher — question posée au TODO, pas ici.

## 3. Les décisions qui reviennent à Hugo

1. ~~**Les gestes d'un client sur son propre compte**~~ — **tranché le
   2026-09-19** par Hugo : « tout doit être journalisé ». Les paniers
   récurrents (créer, suspendre, reprendre, modifier une échéance, supprimer),
   le profil, le RIB, les adresses et les membres **entrent au journal** — et
   la règle « le premier n'engage que lui » de `journal-tracked.mjs` est
   réécrite en conséquence. **Jamais leurs coordonnées** : un fait dit **quels
   champs** ont changé (« adresse e-mail », « téléphone »), pas leurs valeurs ;
   un RIB par ses quatre derniers chiffres ; une adresse par son libellé ; un
   membre par son id. Le changement d'adresse de connexion part chez Auth0
   **avant** la transaction : ce geste est déclaré `@hors-transaction` avec sa
   raison, et son fait s'écrit après la réussite d'Auth0. Ces gestes
   **élargissent le lot 1**.
2. **La permission de la tranche fiscale** : `pim_tax:write` (qui écrit les
   taux relit leur histoire — rien à ajouter à l'écran des rôles), ou une
   permission nouvelle, attribuée au rôle `comptabilite`. Ouvrir un accès se
   reprend mal : la seconde est plus explicite.

## 4. Ce qui n'est pas proposé, et pourquoi

- ~~**Déplacer le code du journal en `platform/`**~~ — **fermé par Hugo le
  2026-09-19** (option 1 : ne rien changer ; l'explication est dans
  [`architecture-journalisation.md`](architecture-journalisation.md) §2). (§3 du TODO.) Le port y est
  depuis le 2026-08-25. Déplacer l'implémentation ferait de `platform` le
  propriétaire de la table (`lint:prisma-model-ownership`), et six lecteurs de
  `b2b` en deviendraient des intrus ; les préfixes de module, qui nomment le
  métier de chaque bloc, entreraient dans la brique technique. Le nom du
  schéma `growth` est trompeur ; le déménagement coûterait plus que ce qu'il
  corrige. **Décision proposée : fermer ce point au TODO.**
- **« Et aujourd'hui, ça touche quoi ? »** (§2) : laissé au TODO, déclenché par
  la première contestation d'un changement de taux.
- **Modifier une règle tarifaire** : de l'argent, plan à part dans `pricing/`.
- **La suppression physique d'un panier récurrent** : dette des paniers
  récurrents, interdite par CLAUDE.md §3 sur un agrégat ; son handler lève aussi
  une `NotFoundException` depuis l'application, et `remove(id)` n'a pas le mur.

## 5. L'ordre des déploiements

**Rien ne se merge le week-end du 19–20 septembre** (sortie d'Accelerate) :
merger dans `main` déploie, quel que soit le lot.

1. **Lot 5** (code seul, contrat compatible).
2. **Lot 1**, dossier par dossier : chaque dossier entre dans la porte avec ses
   faits.
3. **Lot 3** (code seul).
4. **Lot 2** : la recherche d'abord (code seul), l'index ensuite, hors des
   heures d'usage.
5. **Lot 4**, une fois la permission décidée.

## 6. Tests

- **Lot 1** : un e2e par geste — le fait, sa charge **sans coordonnée**, son
  auteur, dans la transaction (une panne du journal annule le geste). La porte
  éprouvée sur un handler neuf sans journal dans un dossier couvert.
- **Lot 2** : « cecile » trouve « Cécile » ; « Élan » trouve « élan » ;
  « person » ne ramène pas un fait pour sa seule clé ; un `"` ou un `\` dans une
  valeur ne casse pas la recherche.
- **Lot 3** : l'onglet Historique montre les trois cercles et rien d'autre —
  un fait d'un autre bloc de sujet `product` n'y entre pas ; le lien « Voir son activité » n'apparaît pas sans `activity:read`.
- **Lot 4** : le lecteur fiscal ne reçoit **jamais** un fait hors de sa liste,
  même avec `module`, `q`, `subjectId` ou un curseur choisis ; `commercial`,
  qui a `pim_tax:read`, reçoit `403`.
- **Lot 5** : sans `before`, la réponse est identique à aujourd'hui ; avec,
  pas de doublon ni de trou à la frontière de deux pages, y compris deux actes
  à la même milliseconde.

## 7. À vérifier avant de bâtir

- Le `LC_CTYPE` de la base de production — `lower()` en dépend. (lot 2)
- `migrate deploy` enveloppe-t-il la migration dans une transaction ? Si oui,
  pas de `CREATE INDEX CONCURRENTLY`, donc l'heure compte. (lot 2)
- Le volume de `activity_events` juste avant l'index. (lot 2)
- `invite-company-member` journalise-t-il par `grant-account-access` ? (lot 1,
  pour la porte)

## 8. Ce que `vitruve` a changé (2026-09-18)

| Objection                                                                                                                                                                         | Ce qui a changé                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| BLOQUANT — la porte étendue à tout `b2b/` refuserait 120 handlers, dont beaucoup journalisent déjà                                                                                | Lot 1 : extension dossier par dossier ; la porte apprend `PricingActWriter` et les délégations |
| BLOQUANT — « tous les gestes journalisent » était faux : surtaxe, dérogations, RIB, catalogue, journée de production                                                              | Inventaire refait (§1), lot 1 recentré sur les actes du staff                                  |
| BLOQUANT — journaliser le profil client violait « jamais l'e-mail ni le téléphone », et le changement Auth0 échappait à la transaction                                            | Retiré : les gestes du client sont une décision de Hugo (§3), jamais avec coordonnées          |
| BLOQUANT — le code en `platform/` : la porte de propriété refuserait, et du métier entrerait dans la brique technique                                                             | Lot retiré ; fermeture proposée (§4)                                                           |
| SÉRIEUX — « la permission des taux telle qu'elle est » ouvre à `commercial` et `dev` ; la tranche oubliait des faits fiscaux ; « module » et « liste de types » se contredisaient | Lot 4 : liste de types, clause `AND`, permission exigée explicitement                          |
| SÉRIEUX — la colonne générée verrouille toutes les écritures opposables, et Prisma la supprimerait                                                                                | Lot 2 : normalisation à la lecture, pas de colonne                                             |
| SÉRIEUX — le journal tarifaire rend un tableau nu déjà servi                                                                                                                      | Lot 5 : paramètre facultatif, forme inchangée                                                  |
| SÉRIEUX — les dispenses d'atelier reposaient sur une fausse raison                                                                                                                | Lot 1 : l'atelier est journalisé, visible en filtrant                                          |
| SÉRIEUX / MINEUR — « aucune extension » était faux (`btree_gist`) ; `translate` avant `lower`                                                                                     | §1 et lot 2 corrigés                                                                           |
| MINEUR — onglet Historique sans filtre de préfixe ; lien staff vers un `403` ; `q` dans l'URL ; montants en centimes ; préfixes orphelins ; calendrier                            | Lots 3, 2, 4 et §5                                                                             |

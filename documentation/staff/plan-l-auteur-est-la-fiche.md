# Plan — l'auteur d'un acte staff est sa fiche, plus jamais son `sub`

> **Ouvert le 2026-09-18** à la demande de Hugo : « me débarrasser du sub auth0
> comme author partout dans l'app et faire en sorte que ça n'arrive plus, et
> que ce soit basé sur le staff id ». Périmètre : **le staff** ; les clients ont
> été inventoriés dans la foulée (§8) — rien à convertir.
>
> Remplace [`journalisation-staff/todo-le-sub-comme-auteur.md`](journalisation-staff/todo-le-sub-comme-auteur.md).
> État : 📐 plan, rien n'est codé. **Deuxième version**, réécrite après une
> contradiction de `vitruve` (§9) qui a trouvé une empreinte que la conversion
> casserait, et un inventaire trop court.

## 0. Résumé

Le `sub` Auth0 est un identifiant **chez un tiers**. Il sert aujourd'hui
d'auteur dans une cinquantaine de colonnes, dans deux journaux, dans des
contrats servis au front — des écrans l'affichent brut, et un export CSV
l'écrit (« établie par auth0|… »). Il lie aussi l'histoire à une identité de
connexion, alors qu'elle appartient à une **personne** : une fiche
([`plan-depart-et-adresses-de-fonction.md`](plan-depart-et-adresses-de-fonction.md)).

Après ce plan :

1. **Le `sub` n'est plus lisible hors de l'authentification** — par le type,
   pas par une règle : une fois la fiche résolue, la requête ne le porte plus.
2. **Tout auteur staff est un `staff_users.id`** — colonnes, acteur du contexte,
   journaux, charges utiles.
3. **Le front et les exports reçoivent des noms.** Les identifiants restent
   servis là où un filtre en a besoin.
4. **L'histoire est convertie** par une **table de correspondance** `sub → fiche`
   que Hugo valide avant qu'elle serve (§3) — parce qu'une fiche a pu avoir
   plusieurs `sub` et qu'aucune table ne les a gardés.
5. **Une exception assumée** : les contenus empreintés du catalogue PIM
   gardent leur `sub` pour toujours (D6).

## 1. Ce qui existe (vérifié le 2026-09-18, revérifié par `vitruve`)

### 1.1 Deux sources d'écriture

| Source                                                                                                    | Où                                                                                                 | Ce qu'elle nourrit                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L'acteur du contexte** — `AdminAuthGuard` pose `{ type: "staff", id: request.staff.subject }`           | `platform/auth/admin-auth.guard.ts:51,67` ; lu par `currentRequestContext()?.actor.id`             | `activity_events.actor_id` ; PIM (`takenBy`, `publishedBy` ×2, `updatedBy` ×5 via `writtenBy()`, `ProductReadiness.readyBy`) ; `CatalogDelivery.acceptedBy`                                                                                                                                                                                                                                                                      |
| **Le `sub` passé à la main** — `@StaffSub()` (44 sites) et **cinq** copies de `staffSubjectOf` (8 appels) | `platform/auth/staff.decorator.ts:16` ; `handover`, `admin-orders`, trois contrôleurs `production` | `*_by_sub` (6, nom et fonction figés à côté par `authorOf`) ; **tarifaire (15 colonnes sur 7 modèles + `PricingEvent.actor`)** ; `alerts` (3) ; `catalog` (`createdBy`, `decidedBy`) ; `User.invitedBy` ; `Order.readyBy` / `handedOverBy` ; `OrderHandover.handedOverBy` ; `production` (`packedBy` ×2, `doneBy`, `retakenBy`, `ProductionContainer.updatedBy`) ; `StaffNotification.readBy` ; `StaffPushSubscription.staffSub` |

**Déjà des ids de fiche** : `Order.placedByStaffId`, `OrderDraft.savedByStaffId`,
`OrderCutoffWaiver.grantedByStaffId`, `OrderLateFee.updatedBy`,
`PlatformContent.updatedBy`, `StaffPermissionOverride.grantedByStaffId`.

### 1.2 Ce qui lit

- **Deux journaux.** `activity_events.actor_id` (servi, **filtré par égalité**
  dans `activity-journal.where.ts:24`) ; les charges utiles de `order.ready`
  (`readyBy`) et `order.handed_over` (`handedOverBy`). Et **`PricingEvent.actor`**
  (`pricing.prisma:503`), journal tarifaire déclaré non réinscriptible,
  affiché brut (`tarification/journal-panel/journal-panel.html:34`).
- **Servis et affichés bruts** : `CatalogRevisionSummaryView.takenBy`,
  `ProductReadinessView.readyBy`, `PackingSheet.packedBy`,
  `OrderHandoverView.handedOverBy`, `archivedBy`
  (`tarification/archives-panel/archives-panel.ts:67`), `mercuriale.createdBy`
  (`fiche-client/tarifs/tarifs-page.html:92`) — **et exporté** par
  `mercuriale-csv.ts:74`. Le champ `sub` du contrat `feature-access.ts:56`.
  (`CatalogRevisionCauseView.by` est déjà un nom.)
- **Résolus en nom** : `PrismaStaffDirectory`, `PrismaActorNamer` — par `auth0Id`.
- **Figés dans une empreinte** : `readyBy` entre dans le contenu de chaque
  article d'une révision PIM (`prisma-catalog-revision.source.ts:81`), dont le
  SHA-256 **est** la clé primaire de `catalog_content`
  (`editorial-media.prisma:44-50`), visée par clé étrangère. Le diff de
  révision le sert tel quel.
- **`StaffPushSubscription.staffSub` n'est lu par personne** : `all()` pousse à
  **tous** les abonnements (`prisma-staff-push-subscriptions.ts:35-39`).

### 1.3 Ce qui ne relève pas du plan

- Les acteurs `system` (`recompute-cron`, `recompute-dev`, `null`).
- `CompanyTermination.initiatedBy` vaut `client` ou `commercial` : pas un auteur.

## 2. Décisions

**D1 — Une seule porte pose l'auteur : `StaffAccessGuard`.** Il résout la
fiche et appelle `attachActor({ type: "staff", id: access.staffUserId })`.
`AdminAuthGuard` n'attache plus d'acteur. `@AdminSurface` monte toujours les
deux gardes ; rien ne lit l'acteur entre eux ; aucun chemin staff n'écrit sans
passer par le second (vérifié par `vitruve` : pas de SSE, pas de websocket, les
handlers lancés sans attente restent dans le contexte). Le contournement de
développement se lie à la fiche racine.

**D2 — Le `sub` sort du type.** `AdminAuthGuard` ne pose plus le principal
vérifié sur `request.staff` : il le passe au résolveur par un canal **interne
à `platform/auth/`** (un symbole non exporté), et `AuthenticatedStaffRequest`
n'expose plus que `access`. `@StaffSub()` et les cinq `staffSubjectOf` sont
supprimés ; leurs **52** appelants passent à `@StaffUserId()`. Une regex
aurait laissé passer `staff!.subject`, une déstructuration ou un alias : on
retire le moyen au lieu de surveiller l'usage.

Côté client, `Principal.subject` reste nécessaire à l'identité (§8) : une porte
`lint:subject-readers` tient la **liste admise** de ses lecteurs, inscrite dans
`lint:gates` (le compte de CLAUDE.md suit).

**D3 — Le front et les exports reçoivent un nom.** Chaque vue qui sert un
auteur gagne `…ByName`, résolu au serveur ; le champ d'identifiant reste servi,
déprécié. Le CSV des mercuriales écrit le nom. **Exception** : `actorId` du
journal reste servi pour toujours — le filtre par personne en a besoin.

**D4 — Pendant la bascule, on lit les deux formes, y compris pour filtrer.**
`PrismaStaffDirectory`, `PrismaActorNamer` et les nouveaux résolveurs de nom
cherchent **par `id`, puis par `sub`** (celui de la fiche **et** ceux de la
table de correspondance, D5). Le filtre par acteur du journal devient
`actor_id IN (<id>, <ses sub connus>)` : l'histoire d'une personne ne se coupe
pas entre deux identifiants.

**D5 — L'histoire se convertit par une table de correspondance validée.**
Une fiche a pu porter **plusieurs `sub`** : le résolveur réécrivait `auth0Id`
sans condition jusqu'au 2026-09-17, la réinvitation en relie un neuf, et la
migration de reprise du journal note que celui de la racine « a pu changer ».
Joindre sur l'`auth0_id` actuel laisserait ces actes en `sub` — probablement
la plupart, la racine étant l'auteur de presque tout.

Donc :

1. une **requête d'inventaire** (lecture seule, production) liste chaque `sub`
   distinct trouvé dans les colonnes du §1, avec ses indices : fiche dont
   c'est l'`auth0_id` actuel, `actor_name` / `actor_role` que le journal lui a
   figés, première et dernière apparition ;
2. une **migration** crée `staff_subject_aliases (sub PK, staff_user_id,
source)` et y inscrit, **en données**, les couples que Hugo a validés sur cet
   inventaire — l'`auth0_id` actuel de chaque fiche d'office, les autres un à
   un ;
3. la **conversion** joint sur cette table, et seulement sur elle. Ce qui n'y
   est pas reste tel quel, et se compte.

La table reste : c'est elle qui rend D4 possible pour toujours si un résidu
existe, et qui dit d'où vient chaque rattachement. Elle ne contient **que des
correspondances validées** — pas de valeur inventée.

La condition de date de la première version (`created_at <= instant de la
ligne`) disparaît : elle couvrait le cas rare, laissait le fréquent, et
comparait un `timestamp` sans fuseau à des `timestamptz` sur des colonnes
`updatedAt` qui avancent.

**D6 — `readyBy` reste dans le contenu empreinté du catalogue, avec l'id de
fiche.** Décidé par Hugo le 2026-09-18, en deux temps : « ok un gros diff »,
puis « on garde readyBy avec l'id ».

Une révision est la photo du catalogue publié ; la signature de chaque fiche
(`readyAt` / `readyBy`) en fait partie
([`../pim/mecanique-revisions-catalogue.md`](../pim/mecanique-revisions-catalogue.md) §4) :
elle dit **qui avait validé l'article au moment de la publication**, ce que
`ProductReadiness` ne sait plus dès qu'une fiche est revalidée. On la garde.

- `ProductReadiness.readyBy` est converti comme le reste (D5) ; les nouvelles
  déclarations écrivent l'id de fiche (D1).
- **La révision qui suit la conversion voit, une fois, chaque article signé
  changer d'empreinte** — `readyBy` passe du `sub` à l'id, sans que personne
  n'ait revalidé. C'est le gros diff accepté par Hugo ; il est **marqué dans la
  révision** (« format ») pour qu'on ne cherche pas ce qui a bougé.
- Les contenus **déjà figés** gardent leur `sub` : on ne réécrit pas une ancre
  (ce serait recalculer des clés primaires, des clés étrangères et les
  empreintes des révisions, par un script, et perdre la garantie « une
  empreinte ne change jamais »). Le diff et l'écran les nomment par D4.
- La déclaration reste aussi au journal : `product.declared_ready`, écrit par
  `declare-product-ready.ts` dans la même transaction, avec l'id de fiche par D1.

**D7 — Les deux journaux se traduisent.** `activity_events.actor_id` (où
`actor_type = 'staff'`), les deux clés de charge utile, et `PricingEvent.actor`.
C'est l'exception de CLAUDE.md §8 pour les valeurs d'un journal : une
**traduction** d'un identifiant vers un autre de la même personne, qui
n'altère ni le fait, ni le sujet, ni l'instant — et dont la table D5 garde le
chemin inverse. Elle s'écrit dans le JSDoc de `PricingEvent`, qui dit
aujourd'hui « non réinscriptible ». `actor_name` / `actor_role` ne bougent pas.

**D8 — Les champs nommés `sub` sont renommés.** Colonnes `*_by_sub` →
`*_by_staff_id` (trois temps, à la fin) ; dans le code, `StaffTrace.sub` et les
champs `sub` des contrats `admin-company.ts:167` et `feature-access.ts:56`, au
moment de la bascule. Un nom qui ment sur sa valeur est le défaut que
CLAUDE.md §8 interdit.

**D9 — L'abonnement push est une trace, pas un ciblage.** `staffSub` →
`staff_user_id`, converti comme le reste. Le plan ne promet rien de plus :
aujourd'hui **tout** abonnement reçoit **toute** notification, y compris
celui d'une personne partie — ce point rejoint le plan de départ (les
abonnements d'une fiche partie sont retirés à son départ).

## 3. Avant d'écrire une ligne : l'inventaire de production

Hugo, le 2026-09-18 : **aucun `sub` Google** n'existe encore. La table sera
donc courte ; l'inventaire reste nécessaire pour le `sub` de la racine, qui a pu
changer avant le 2026-09-17 sans être Google.

La requête du D5.1, en lecture seule, proposée à Hugo et lancée par lui. Elle
rend la liste des `sub` et leurs indices, plus les valeurs qui ne sont pas des
`sub` (`unknown-staff`, `dev-staff`, `system`). **C'est sur ce document que
Hugo valide les correspondances** ; le plan ne suppose pas le résultat.

## 4. L'ordre des déploiements

0. **`DELETE` d'une fiche staff répond `409`** (le D8 du plan de départ,
   avancé ici). Une fiche supprimée entre deux étapes emporterait la seule
   trace de ses `sub`. Hugo l'a déjà décidé : « pas possible de supprimer une
   fiche staff ».
1. **Lire les deux formes, servir des noms** (D3, D4 sans table). Aucun
   changement d'écriture. La fuite visible s'arrête ici, export compris.
2. **La table de correspondance** (D5.2), remplie de ce que Hugo a validé. Les
   lecteurs et le filtre la lisent.
3. **Écrire l'id** (D1, D2, D8 côté code, D9 côté code), avec
   `lint:subject-readers`.
4. **Convertir** (D5.3, D7) — une migration, livrée **dans le déploiement
   suivant** l'étape 3 : l'ancienne instance, qui répond encore une à deux
   minutes après le basculement (`deploy_lfd_api.yml`), a fini d'écrire des
   `sub`. Si le contrôle (§5) trouve un reste, c'est une **nouvelle**
   migration, proposée à Hugo — pas du SQL à la main.
5. **Renommer** les `*_by_sub` (trois temps) ; **resserrer** les contrats.

**Allers simples, à savoir avant de commencer** : la conversion (4) ne se
défait que par la table D5 ; la conversion de `ProductReadiness.readyBy`
(4) fait naître une génération d'empreintes qu'on ne défait pas (D6).

## 5. Tests et contrôles

- **Type** : un contrôleur staff ne peut plus lire un `sub` — le test est la
  compilation ; la porte client, cas refusé et cas admis.
- **Garde** : après `StaffAccessGuard`, l'acteur est l'id de fiche ; une requête
  refusée n'attache rien.
- **E2E** : les **19** fichiers qui touchent un champ d'auteur, dont une
  dizaine attendent un `sub` en dur (`admin-catalog`, `admin-pricing`,
  `company-pricing`, `feature-access`, `pim-readiness`, `production-batch`,
  `admin-company-pieces`, `delivery-procedure`, `client-notes-wall`…),
  attendent l'id — et le nom là où la vue le sert.
- **Lecteurs et filtre** : une ligne à `sub` actuel, une à `sub` ancien (table),
  une à id se nomment pareil et sortent sous le même filtre.
- **Conversion** (e2e sur la migration) : un `sub` de la table devient l'id ; un
  `sub` absent reste ; rejouer ne change rien ; `catalog_content` intact.
- **Révision PIM** (D6) : après conversion, un article signé change
  d'empreinte avec pour seul écart `readyBy` (`sub` → id) ; une révision
  suivante sans revalidation ne voit aucun changement ; les contenus figés
  avant la conversion sont intacts.
- **Contrôle après l'étape 4**, en lecture seule : aucune valeur hors table
  dans les colonnes converties — le motif cherche les `sub` (`…|…`) **et**
  `unknown-staff` / `dev-staff`.

## 6. Ce que ce plan ne fait pas

- **Les clients** : rien à convertir (§8).
- **Le départ d'un membre** : [plan distinct](plan-depart-et-adresses-de-fonction.md).
  Après celui-ci, le journal n'a plus besoin que le `sub` reste sur la fiche
  partie pour nommer un auteur ; le D3 du plan de départ garde sa raison de
  sécurité (un jeton non révocable).

## 7. Non vérifié

- Le résultat de l'inventaire (§3) — tout le volume de la table D5 en dépend.
- Si une révision PIM se prend automatiquement (ampleur de la révision « format »).
- Ce que `PlatformContent.updatedBy` contenait avant son passage à
  `@StaffUserId()` : il entre dans l'inventaire.
- Les charges utiles `jsonb` au-delà des clés d'auteur connues : l'inventaire
  les balaie par motif.

## 8. Et les clients ? Inventaire (vérifié le 2026-09-18, confirmé par `vitruve`)

Hugo : « dans la foulée, pour les clients, ce serait la même mécanique ? » —
**elle y est déjà**, depuis `a95424b3` (2026-08-07).

| Question                                      | Réponse                                                                                                                                                                                                                                         |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qui pose l'acteur d'une requête client ?      | `AuthGuard.attachIdentity` : `{ type: "customer", id: principal.userId }` — l'id de `users` (`auth.guard.ts:86`). C'est ce que D1 fait faire au garde staff                                                                                     |
| Le journal ?                                  | `actor_id` des faits clients = cet id ; `actor_type` distingue les formes                                                                                                                                                                       |
| Une colonne écrit-elle le `sub` d'un client ? | **Non.** Le seul `sub` client en base est `users.auth0_sub`. (`users.invited_by`, dans une table client, porte un `sub` **staff** : il est au §1.)                                                                                              |
| Qui lit le `sub` client, et pourquoi ?        | L'identité seulement : changer l'adresse chez Auth0 (`me.controller.ts:64`), l'accès en attente, l'invité sans compte (`auth0Sub: null` est ce qui FAIT l'invité), l'impersonation de développement — la liste admise de `lint:subject-readers` |

**Trois fuites du `sub` hors auteur, reprises ici :**

- **`ProfileView.subject`** (`packages/contracts/src/account.ts:54`) : servi à
  « Mon profil », lu par aucun code du front (seule une fixture le porte).
  Déprécié à l'étape 1, retiré à l'étape 5.
- **Un log de production** écrit le `sub` avec l'adresse :
  `grant-account-access.service.ts:225`. Il écrira l'id local.
- **Le message de `IdentitySubjectUnknownError`** contient le `sub`
  (`identity-errors.ts:52`), et `AppErrorFilter` le journalise
  (`app-error.filter.ts:80`) — levée par la passerelle sur trois chemins, dont
  `changeEmail` depuis « Mon profil ». Le message cesse de contenir le `sub`.

## 9. Ce que `vitruve` a changé (2026-09-18)

| Objection                                                                                                     | Ce qui a changé                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| BLOQUANT — `readyBy` est dans un contenu adressé par son empreinte ; la conversion casse les ancres           | D6 : les contenus figés ne se convertissent pas ; `readyBy` reste, avec l'id de fiche ; les contenus figés ne sont pas réécrits (Hugo) |
| BLOQUANT — inventaire court : `User.invitedBy`, `PricingEvent.actor`, 16 colonnes tarifaires, vues et export  | §1 refait ; D7 traite le journal tarifaire ; D3 couvre l'export CSV                                                                    |
| SÉRIEUX — une fiche a eu plusieurs `sub` ; « zéro, le plus probable » était une décision esquivée             | D5 : table de correspondance validée par Hugo sur un inventaire, avant toute conversion                                                |
| SÉRIEUX — D6 (push) promettait un ciblage qui n'existe pas                                                    | D9 : trace seulement ; le ciblage rejoint le plan de départ                                                                            |
| SÉRIEUX — la « relance » de la conversion n'avait pas de mécanisme, et l'ordre se contredisait                | §4 : conversion dans le déploiement suivant ; un reste = une nouvelle migration                                                        |
| SÉRIEUX — le filtre par acteur coupait l'histoire d'une personne                                              | D4 : filtre sur l'id et ses `sub` connus ; `actorId` reste servi                                                                       |
| SÉRIEUX — une regex ne rend pas le `sub` inexprimable                                                         | D2 : le `sub` sort du type après résolution ; la porte ne garde que le côté client                                                     |
| SÉRIEUX — « aucun `DELETE` entre 3 et 5 » tenu par rien                                                       | §4, étape 0 : `DELETE` répond `409` d'abord                                                                                            |
| MINEUR — comptes, sources, déjà-propres, fuseaux, `unknown-staff`, champs `sub` du code, 19 e2e, log d'erreur | Corrigés dans le §1, D5, D8, §5, §8                                                                                                    |

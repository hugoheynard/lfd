# Des droits par geste, et des rôles réglés à l'écran

> ✅ **Bâti le 2026-10-01** : DG0 à DG6 (`8b424bb2f`, `80fc1f56a`) ; DG7, les
> tests des dérogations, existait déjà (`fb274494e`). Le texte ci-dessous est
> le plan d'origine ; ce qui reste est le réglage des rôles **à l'écran**
> (`tableau-droits-livraison.md`), jamais par migration.
>
> **Relu contre le code le 2026-10-07** (audit du dossier `livraisons/`) : ce
> qui était devenu faux est corrigé en place et daté — l'arrêt du plan sous
> `production_count_stop`, les routes du colisage retirées en K3c, l'écran
> `/admin/roles`, le rail sans entrée Production, une graine qui ne sème que
> les e2e, le préfixe d'une ressource. La fin du § 6 ajoute les écarts entre
> l'écran et l'API relevés ce jour-là.

> 📐 **Plan** (2026-10-01) — _bâti, voir le bandeau ci-dessus_. Hugo : « `b2b_orders` doit être
> découpé en actions granulaires, et il faut que j'arrête de hardcoder des
> bouts de rôle dans la base, ça doit être du paramétrage admin ».
>
> **Remplace** le projet de [`plan-droit-procedures.md`](plan-droit-procedures.md)
> (dont les objections de `vitruve` sont reprises ici) et fait du
> [`tableau-droits-livraison.md`](tableau-droits-livraison.md) une **feuille de
> réglage**, plus un contenu de migration.
>
> Frontières d'accès déplacées sur une production en service : **`vitruve`
> avant Hugo**.

## 1. L'état, relevé le 2026-10-01

### 1.1 Ce que `b2b_orders` ouvre aujourd'hui — cinq métiers

| Geste                                                                                                                                                 | Routes API                                                                                      | Bloc                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| **Les commandes** : lister, passer pour un client, devis, brouillons, traçabilité tarifaire, catalogue vendable, historique client, rappel de retrait | `admin/orders*`, `admin/order-drafts/*`, `admin/orders/:id/lines/:sku/rules`, `admin/catalog/*` | `b2b/orders`                  |
| **Le plan du soir** : état de la journée, arrêter le plan, reprendre une journée, lot du jour                                                         | `admin/production/status`, `…/:date/close`, `…/batch/:date/retake`, `admin/production/batch`    | `production` (+ `b2b/orders`) |
| **La fiche d'atelier** : lire, cocher, décocher                                                                                                       | `admin/production/worksheet*`                                                                   | `production`                  |
| **Le colisage** : poste, lignes, containers, « prête », fiche derrière le QR — _retirés en K3c (2026-10-05), sauf la fiche : voir 5.1_                | `admin/production/packing*`, `…/sheets/:ref/packed`, `admin/production/packing/:ref`            | `production` (+ `b2b/orders`) |
| **Le retrait au comptoir** : file, remise manuelle, scan du QR                                                                                        | `admin/handover/*`                                                                              | `handover`                    |

Plus `admin/production/version` (la version de journée, une lecture technique
des postes du fournil).

Côté écran (`apps/lfd-backoffice-frontend`) : `app.routes.ts` l. 43, 123, 134,
178, 188, 465, 515 ; l'entrée Production du rail (`app.ts:173`) ; les liens de
supervision (`supervision/supervision-links.ts:26`). _(Lignes du 2026-10-01 ;
il n'y a plus d'entrée Production unique au rail depuis le 2026-10-06 — voir
DG-D1.)_

Rôles qui le tiennent : admin, commercial, comptoir et **comptabilité** en
écriture, support en lecture. Conséquence : coliser emporte le droit de passer
une commande, et la comptabilité peut coliser.

### 1.2 Les rôles en dur

- **Seize migrations** écrivent dans `public.staff_role_definitions` depuis
  `20260901140000_roles_definis` (liste relevée le 2026-10-01, la dernière
  étant `20261001120100_le_role_livreur`, pas encore en production). Chaque
  ressource neuve a donné « la ressource + son attribution à des rôles ».
- `ROLE_GRANTS` (`packages/contracts/src/staff-access.ts`) est un **miroir**
  tenu égal à la base par le test de parité des rôles (supprimé depuis, DG4), qui
  rejoue ces migrations.
- « L'admin couvre tout » est tenu par **une ligne de migration à chaque
  ressource** et par un test du contrat (`__tests__/staff-access.spec.ts`).
- **Ce qui existe déjà pour régler à l'écran** : l'écran `/admin/roles`
  (créer, modifier, archiver un rôle — `admin/roles/` côté front), servi par
  la route d'API `admin/staff-roles` (`admin-staff-roles.controller.ts`). Les
  **dérogations** par personne ont aussi leur écran, que ce relevé n'avait pas
  ouvert : la grille « Hérite / Autorisé / Refusé » de la fiche d'un membre,
  sous `/admin/utilisateurs` (`overrides-grid.ts`, l. 22-24 ;
  `PATCH /admin/staff-users/:id`). Constaté le 2026-10-01, voir DG-D9.
- Le `superadmin` **n'est pas le rôle admin** : c'est la résolution de la
  **fiche racine** (de secours), calculée en code, sans ligne en base
  (`staff-access.policy.ts`, `staff-role-support.ts`). Le rôle `admin`, lui,
  est une ligne comme les autres.

## 2. Décisions

### DG-D1 — Des ressources par geste (modèle inchangé : ressource × lire/écrire)

On garde le modèle (une ressource, `read` ou `write`, l'écriture emporte la
lecture) : l'écran des rôles, les dérogations, les gardes et `@AdminSurface`
ne changent pas de forme. On **ajoute des ressources**, une par geste :

| Ressource              | Ouvre                                             | Remplace sur ces routes                            |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `b2b_orders` _(reste)_ | les commandes du commerce (tableau 1.1, ligne 1)  | —                                                  |
| `production_plan`      | état de la journée, lot du jour — voir ci-dessous | `b2b_orders`                                       |
| `production_worksheet` | la fiche d'atelier                                | `b2b_orders`                                       |
| `production_packing`   | le poste de colisage **et** le panneau « Bacs »   | `b2b_orders` et, pour les bacs, `delivery_loading` |
| `handover_counter`     | la file de retrait, la remise, le scan            | `b2b_orders`                                       |
| `delivery_procedures`  | les procédures de livraison côté staff            | `b2b_companies`                                    |

⚠️ **Arrêter et reprendre ne sont pas sous `production_plan`** (corrigé le
2026-10-07 ; ce tableau les y mettait). Arrêter le plan
(`POST batch/:date/close`) l'était au bâti, puis est passé sous
`production_count_stop:write` le 2026-10-06
(`production-day.controller.ts`, l. 205-206) : `production_plan:write`
n'ouvre plus rien (`staff-resource-scopes.ts:161`, plan
`documentation/production/arret-du-plan.md`). Reprendre une journée
(`POST worksheet/:date/retake`) est sous `production_worksheet` depuis le
bâti (5.1).

`admin/production/version` s'ouvre à **n'importe laquelle** des ressources du
fournil (`@RequireAnyPermission`) : c'est un numéro technique dont tout poste a
besoin. L'entrée Production du rail suivait la même règle ; **elle n'existe
plus depuis le 2026-10-06**. Quatre entrées la remplacent, chacune sous son
droit (`app.ts` du back-office, l. 177-208) : **Exploitation** (sections
Production et Livraison, visible dès qu'une de ses vues l'est — le
prévisionnel sous `production_plan:read`), **Fournil**
(`production_worksheet:read`), **Colisage** (`production_packing:read`) et
**Comptoir** (`handover_counter:read`, ou `b2b_counter:read` avec
`b2b_place_order:write`).

Le préfixe (`pim_*`, `b2b_*`, `delivery_*`, `staff_*`) nomme l'**outil** du
geste — le contrat l'écrit « la ressource porte son OUTIL »
(`staff-access.ts:34`) —, pas le bloc de `src/` qui sert la route, et les
deux divergent : `b2b_supervision` garde des routes de `production/` et de
`handover/` autant que de `b2b/orders/` ; `production_plan` et
`production_packing` en gardent aussi dans `b2b/orders/`
(`admin-production.controller.ts`) ; `delivery_procedures`, dans
`b2b/account/`. _(Corrigé le 2026-10-07 : cette phrase disait « bloc ». La
ligne suivante du contrat, « les outils sont les blocs de `src/` : `pim`,
`b2b`, `staff`, `ops` », date du 2026-09-01 et ne nomme ni le fournil, ni le
retrait, ni la livraison, ni le colisage.)_

### DG-D2 — Une migration ajoute une ressource, jamais un droit à un rôle

Règle, écrite dans le CLAUDE.md quand le plan sera bâti :

> Une migration peut **ajouter une valeur** à `StaffResource`. Elle n'écrit
> **jamais** dans `staff_role_definitions` ni dans les dérogations. Qui a quel
> droit se règle à l'écran.

**Une seule exception, la bascule de ce plan** (DG-D4), parce qu'une ressource
qui reprend des routes existantes ne doit faire perdre l'accès à personne le
jour du déploiement. Elle est écrite comme une **transition**, une fois.

### DG-D3 — L'admin couvre tout par calcul

Le rôle `admin` résout **toutes** les ressources en écriture, **en code**, au
même endroit que la fiche racine (`superadmin`) — plus par une ligne de
migration à chaque ressource. Sa ligne en base reste (libellé, affectations)
mais ses `grants` ne sont plus lus. L'écran des rôles le montre « tous les
droits, non modifiable ».

⚠️ À trancher avec `vitruve` : un admin qu'on voudrait **restreindre** par
dérogation — le calcul l'ignore-t-il, comme `superadmin` ignore les écarts ?
Proposé : **non** — les dérogations `deny` continuent de s'appliquer à un
admin ; seule la fiche racine les ignore.

### DG-D4 — La bascule du premier déploiement

Dans une migration, après les valeurs d'enum (migration seule, Postgres) :

1. **Chaque rôle qui a `b2b_orders`** reçoit `production_plan`,
   `production_worksheet`, `production_packing` et `handover_counter` **au même
   niveau**. Personne ne perd rien ce jour-là, comptabilité comprise ;
2. **Chaque rôle qui a `delivery_loading:write`** reçoit en plus
   `production_packing:write` (le panneau « Bacs » change de droit) ;
3. **Chaque rôle qui a `b2b_companies`** reçoit `delivery_procedures` au même
   niveau ;
4. **Chaque dérogation** sur une ressource reprise est **recopiée** sur les
   ressources qui la reprennent, `allow` comme `deny` (objection de `vitruve`
   au plan des procédures : un `deny` qui cesse de jouer est un élargissement
   silencieux).

Tout est calculé **depuis l'état de la base**, pas depuis une liste de rôles
écrite dans la migration : elle couvre les rôles créés à l'écran. Idempotente.

Ensuite, Hugo règle à l'écran (DG-D7).

### DG-D5 — `ROLE_GRANTS` devient une graine

- `ROLE_GRANTS` ne sert plus qu'à **semer** ; il n'est plus un miroir de la
  production. ⚠️ **Il ne sème que la base des e2e** (relevé le 2026-10-07) :
  `legacyRoleSeeds()` n'a qu'un appelant, `test/e2e-harness.ts:456`. Ni
  `prisma/seed*.ts`, ni `setup-dev-database.ts` (qui ne fait que
  `prisma migrate deploy`), ni `src/dev/` n'écrivent de rôle : une base de
  dev montée par `db:dev:setup` ne tient que ce que les anciennes migrations
  de rôles et la bascule y ont écrit. Une ressource neuve n'y est accordée
  à aucun rôle, sauf à l'écran — seule la fiche racine la résout. Ouvert
  (audit du 2026-10-07, Q4) : semer le dev, ou écrire « e2e seulement »
  partout où l'on dit « dev ».
- le test de parité des rôles est **remplacé** par un test qui
  vérifie que la graine est **valide** (ressources connues, pas de doublon) et
  qu'une base semée a les rôles attendus.
- Les seize migrations passées **ne se touchent pas** (leurs fichiers sont
  immuables) ; elles restent l'histoire.

### DG-D6 — Le rôle `livreur` naît à l'écran

`20261001120100_le_role_livreur` **n'est pas en production**. Elle est
**retirée** du dépôt avant la mise en ligne (en dev : ligne retirée de
`_prisma_migrations`, rôle supprimé de la base locale ; `db:test:setup` ne la
rejoue plus). Reste `20261001120000_le_droit_de_conduire` (la ressource seule).
Hugo crée « Livreur » à l'écran avec `delivery_driving`. L'e2e
`delivery-driver-role` sème son rôle lui-même au lieu de rejouer la migration.

### DG-D7 — Le réglage d'Hugo, après la bascule

Le [`tableau-droits-livraison.md`](tableau-droits-livraison.md), mis à jour
avec les ressources de DG-D1, devient la **feuille de réglage** : ce qu'Hugo
applique à l'écran `/admin/roles` (comptoir sans livraison, colisage au
comptoir, procédures à l'admin et au commercial…). Rien de ce réglage n'est
dans le code.

### DG-D8 — Les vues qui portent la procédure

Objections reprises du plan des procédures :

- la **feuille de route** sert le texte des procédures à qui lit
  `delivery_run_sheet` (support compris) : la procédure y est **masquée** quand
  le lecteur n'a pas `delivery_procedures:read` ;
- le **carnet d'adresses** sert `procedureStepCount` sous `b2b_companies` :
  masqué de même ;
- les quatre écrans front qui testent `b2b_companies:read` pour les photos
  (`livraison-page.ts:118`, `rounds-page.ts`, `run-sheet-stop.ts:49`,
  `run-sheet-step-photo.ts:24`) testent `delivery_procedures:read`.

### DG-D9 — L'écran des dérogations

Pour que « tout se règle à l'écran » soit vrai : sur la fiche d'un membre du
staff, ses dérogations (accorder, retirer, par ressource et niveau), avec le
droit effectif résultant affiché. Lot à part, après la bascule.

> ✅ **Constaté déjà bâti le 2026-10-01** (DG7) : `PATCH /admin/staff-users/:id`
> sous `staff_access`, grille « Hérite / Autorisé / Refusé » sur la fiche, droit
> effectif par `resolveHeldRole`, fait `staff_user.overrides_changed`. Le lot
> n'a ajouté que trois e2e (`staff-access.e2e-spec.ts`). Le plan l'avait cru
> absent sans ouvrir l'écran.

## 3. Les lots

| Lot     | Contenu                                                                                                                                                  |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DG1** | Valeurs d'enum (migration seule) : `production_plan`, `production_worksheet`, `production_packing`, `handover_counter`, `delivery_procedures` ; libellés |
| **DG2** | La bascule (DG-D4), e2e : un rôle créé à l'écran et une dérogation `deny` sont bien recopiés ; rejouer ne double rien                                    |
| **DG3** | Les gardes API et écran rebranchées (DG-D1), `RequireAnyPermission` pour la version et le rail ; e2e par geste                                           |
| **DG4** | Admin calculé (DG-D3) ; `ROLE_GRANTS` graine et nouveau test (DG-D5) ; règle dans le CLAUDE.md                                                           |
| **DG5** | Rôle `livreur` retiré des migrations (DG-D6)                                                                                                             |
| **DG6** | Procédure masquée (DG-D8)                                                                                                                                |
| **DG7** | Écran des dérogations (DG-D9)                                                                                                                            |

Avant la mise en ligne : relevé en production, par Hugo, des rôles et des
dérogations (`SELECT key, grants FROM staff_role_definitions` ; les
dérogations sur `b2b_orders`, `b2b_companies`, `delivery_loading`), pour que la
bascule soit vérifiable ligne à ligne. Et prévenir : l'écran garde ses droits
jusqu'au rechargement de la page, et le cache serveur 30 s (§ 5.8, relu le
2026-10-07).

## 4. Questions

| #         | Question                                                                            | Proposé                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **DG-Q1** | Faut-il découper aussi les **commandes** (passer pour un client ≠ lister ≠ devis) ? | Pas maintenant : un geste de plus le jour où un rôle doit lire sans passer. Le modèle le permet sans migration de données. |
| **DG-Q2** | Les dérogations `deny` s'appliquent-elles à l'admin calculé ?                       | Oui (DG-D3).                                                                                                               |
| **DG-Q3** | La comptabilité garde-t-elle le colisage après la bascule ?                         | La bascule le lui garde ; Hugo le retire à l'écran s'il le veut.                                                           |

## 5. v2 après `vitruve` (2026-10-01) — ce qui remplace § 2 et § 3

Trois `BLOQUANT`, sept `SÉRIEUX`. Là où cette section contredit ce qui
précède, **elle l'emporte**.

### 5.1 L'inventaire exhaustif (relevé au `grep` des dix contrôleurs gardés `b2b_orders`, 2026-10-01)

| Contrôleur                                                            | Route                                                                                                                                                               | Ressource cible                                                                                |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `b2b/orders/http/admin-orders.controller.ts` (`admin/orders`)         | `GET` liste · `GET :id` · `GET :id/bon.pdf` · `POST` passer · `POST quote` · `POST :id/rappel-retrait` · `GET day-version`                                          | `b2b_orders`                                                                                   |
| `b2b/orders/http/admin-order-drafts.controller.ts`                    | `GET/PUT/DELETE :companyId`                                                                                                                                         | `b2b_orders`                                                                                   |
| `b2b/orders/http/admin-order-pricing.controller.ts`                   | `GET :id/lines/:sku/rules`                                                                                                                                          | `b2b_orders`                                                                                   |
| `b2b/orders/http/admin-catalog.controller.ts`                         | `GET sellable` · `GET companies/:companyId`                                                                                                                         | `b2b_orders`                                                                                   |
| `b2b/orders/http/admin-production.controller.ts` (`admin/production`) | `GET batch`                                                                                                                                                         | `production_plan`                                                                              |
| idem                                                                  | `GET packing/:reference` (la fiche derrière le QR)                                                                                                                  | `production_packing` — **garde par méthode**, la classe se scinde ou porte une garde par route |
| `production/http/production-day.controller.ts`                        | `GET batch/:date/status` · `GET forecast` · `GET batch/:date/compte-a-produire.pdf`                                                                                 | `production_plan`                                                                              |
| idem                                                                  | `POST batch/:date/close` (arrêter le plan)                                                                                                                          | `production_plan` au bâti ; **`production_count_stop:write`** depuis le 2026-10-06             |
| idem                                                                  | `GET batch/:date/sheets/:reference.pdf` (fiche d'atelier imprimable)                                                                                                | `production_worksheet`                                                                         |
| idem                                                                  | `POST batch/:date/sheets/:reference/packed` — _retirée en K3c (2026-10-05)_                                                                                         | `production_packing`                                                                           |
| `production/http/production-worksheet.controller.ts`                  | `GET worksheet` · `GET worksheet/current` · `PUT/DELETE …/lines/:sku/done` · `PUT …/batches/:batchId` · `DELETE …/batches/:batchId` · `POST worksheet/:date/retake` | `production_worksheet`                                                                         |
| idem                                                                  | `GET/PUT/DELETE containers*` (contenants du four par SKU)                                                                                                           | `production_worksheet` (c'est du matériel de four, pas d'expédition — cf. `production.prisma`) |
| production/http/production-packing.controller.ts (retiré en K3c)      | `GET packing` · `PUT …/lines/:sku` · `PUT …/containers` · `POST …/containers/:step` · `DELETE …/lines/:sku` — _le poste est `packing/http/*` depuis K3c_            | `production_packing`                                                                           |
| `production/http/production-day-version.controller.ts`                | `GET version`                                                                                                                                                       | **n'importe laquelle** des quatre du fournil (`@RequireAnyPermission`)                         |
| `handover/http/handover.controller.ts`                                | `GET file` · `POST manual/:reference` · `GET order/:id` · `GET :token` · `POST :token`                                                                              | `handover_counter`                                                                             |

_Corrigé le 2026-10-07._ L'arrêt du plan a quitté `production_plan` le
2026-10-06 (`production-day.controller.ts`, l. 205-206). K3c (`753f3e4f8`,
2026-10-05) a retiré l'ancien poste de colisage du fournil : le poste est
`packing/http/*` (`admin/packing/:date/…`), sous la même ressource
`production_packing`, et des routes `admin/production/packing*` ne reste que
la fiche derrière le QR, `GET admin/production/packing/:reference`
(`admin-production.controller.ts:52`).

Côté écran, en plus des lignes de § 1.1 : `auth/permission.guard.ts:20`
(l'atterrissage `/commandes` choisi par `b2b_orders:read`),
`shared/workspace-rail/workspaces.ts` (l. 131, 258, 275),
`fiche-client/fiche-client.routes.ts:77`,
`shared/day-version/day-version.service.ts:13`, et le commentaire
`app.routes.ts:169`. Chacun prend la ressource du geste qu'il ouvre ;
`LANDINGS` gagne une entrée par ressource du fournil.

### 5.1 bis — `b2b_place_order` : passer une commande pour un client pro

> Hugo, 2026-10-01 : « il me faut aussi un droit `b2b_place_order`, qui est la
> capacité à poser une commande pour un client pro — commercial et comptoir ».
> Tranche DG-Q1 (« faut-il découper les commandes ? ») : **oui, ce geste-là**.

| Route                                                                                                                                  | Ressource cible          |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `POST admin/orders` (passer pour un client)                                                                                            | `b2b_place_order`        |
| `POST admin/orders/quote` (le devis qui précède)                                                                                       | `b2b_place_order`        |
| `GET/PUT/DELETE admin/order-drafts/:companyId` (le brouillon)                                                                          | `b2b_place_order`        |
| `GET admin/catalog/sellable` · `GET admin/catalog/companies/:companyId` (ce qu'on peut vendre, l'historique du client — pour composer) | `b2b_place_order`        |
| `GET admin/orders` · `GET :id` · `GET :id/bon.pdf` · traçabilité tarifaire · `POST :id/rappel-retrait`                                 | **restent** `b2b_orders` |

Ressource à **une action** utile (`write`) : il n'y a rien à « lire » dans le
geste de passer une commande ; lire les commandes reste `b2b_orders:read`.
Côté écran : la page « Nouvelle commande » (`app.routes.ts` l. 43 et 134) et
son entrée de menu passent à `b2b_place_order:write`.

**Bascule** : une source, `b2b_orders:write` → `b2b_place_order:write`. La
comptabilité, qui tient `b2b_orders:write`, la reçoit le jour J ; Hugo la lui
retire à l'écran (feuille de réglage). Réglage visé : **commercial et comptoir**
(et l'admin).

### 5.2 BLOQUANT 1 — `ROLE_GRANTS` est encore une source en production

Une fiche dont `role_key` est nul résout ses droits par
`ROLE_GRANTS[row.role]` (`staff/permissions/infrastructure/held-role.ts:87-93`,
« repli de transition retiré au resserrer »). La bascule ne la couvre pas.

**Relevé à faire par Hugo avant de bâtir :**
`SELECT count(*) FROM staff_users WHERE role_key IS NULL;` (vérifier le nom
exact de la table au bâti).

- **Zéro** : le resserrement d'abord — on retire le repli, et `ROLE_GRANTS`
  devient vraiment une graine (DG-D5 tient).
- **Plus de zéro** : `ROLE_GRANTS` reçoit les nouvelles ressources **au même
  déploiement**, comme ce qu'il est encore — une source — et DG-D5 attend le
  resserrement. C'est écrit comme une dette datée, pas comme un droit accordé
  par le code.

**Relevé par Hugo le 2026-10-01 : zéro fiche sans clé de rôle en production.**
Le resserrement passe donc **d'abord**, dans le lot DG0 :

- le repli `ROLE_GRANTS[row.role]` est retiré de `held-role.ts` ;
- `staff_users.role_key` devient `NOT NULL` (migration de resserrement : zéro
  ligne nulle relevée en production ; la migration échoue plutôt que de
  remplir quoi que ce soit si une ligne nulle est apparue entre-temps) ;
- `ROLE_GRANTS` n'est plus lu au runtime : c'est une **graine** (DG-D5 tient).

### 5.3 BLOQUANT 3 — pas de fusion de droits : une ressource neuve n'a qu'une source

La v1 faisait hériter `production_packing` de `b2b_orders` **et** de
`delivery_loading` : deux sources, une clé unique
(`@@unique([staffUserId, resource, action])`, `staff.prisma:290`), des
dérogations contradictoires sans règle. **Retiré.**

- `production_packing` hérite **seulement** de `b2b_orders`.
- Le panneau « Bacs » (`delivery-bins.controller.ts:44`, les déclarations) et
  la proposition de colisage (`delivery-packing.controller.ts:24`) passent à
  `@RequireAnyPermission("production_packing:write", "delivery_loading:write")`
  — on **élargit la porte**, on ne déplace aucun droit, aucune dérogation n'a
  à fusionner.
- Chaque ressource neuve a **une** source ; une dérogation se recopie donc
  **une pour une**, sans collision possible. Un e2e le prouve (un `deny` sur
  `b2b_orders:write` donne un `deny` sur chacune des **cinq** —
  `production_plan`, `production_worksheet`, `production_packing`,
  `handover_counter` et `b2b_place_order` de 5.1 bis ;
  `gesture-rights-switchover.e2e-spec.ts:211`).

**Relevé par Hugo le 2026-10-01 : aucune dérogation** sur `b2b_orders`, `b2b_companies` ni `delivery_loading` en production. La recopie ne concerne personne aujourd'hui ; elle reste codée et testée, pour le cas où une dérogation serait posée d'ici le déploiement.

### 5.4 L'admin calculé sort de ce plan

DG-D3 croise la garde anti-verrouillage (`keepsDirectory` et la comparaison
des dérogations, dans `staff/permissions/staff-access.policy.ts`, qui
raisonnent sur les `grants` — localisé le 2026-10-01 ; la v1 de ce relevé
citait une ligne d'un autre fichier) et ferait de
`"admin"` une clé magique. Il mérite son propre plan. **Ici**, l'admin reçoit
les quatre ressources par la bascule, comme tout rôle qui a `b2b_orders`.

Conséquence assumée : tant que l'admin n'est pas calculé, **une future
ressource** devra encore lui être accordée — par l'écran, puisque DG-D2
l'interdit aux migrations. Écrit dans la règle du CLAUDE.md.

### 5.5 DG-D2 a un mécanisme

Une porte `lint:no-role-grants-in-migrations` : refuse `staff_role_definitions`
et `staff_permission_overrides` dans tout `migration.sql` **postérieur** à la
bascule, avec la bascule comme seule exception datée. Sans elle, la règle est
de la prose contre seize précédents.

### 5.6 Les tests qui figent « une migration accorde »

Pas seulement la parité. À traiter un par un au bâti (supprimé, figé sur une
constante locale, ou réécrit) : `staff-role-grants-parity`,
`counter-roles-migration` (l. 156), `price-limits-migration` (l. 154),
`storefront-roles-migration`, `deferred-payment-block-roles-migration`,
`staff-role-keys-migration`, `staff-roles-in-database`.

### 5.7 DG-D6 — le retrait de la migration du livreur

L'appelant est `test/delivery-driver-scene.ts:23` (`DRIVER_ROLE_MIGRATION`).
La migration n'est pas la dernière (`20261001120200`, `…120300` la suivent) et
elle est appliquée en dev et en test : après le retrait, **`db:test:setup`**
et, en dev, retirer sa ligne de `_prisma_migrations` et le rôle — sinon
`migrate dev` signale une dérive et propose un reset. Prévenir Hugo du geste.

### 5.8 L'ordre de déploiement — un seul déploiement

1. migration A : les valeurs d'enum, **seules** ;
2. migration B : la bascule (après A, autre transaction) ;
3. API et front **ensemble** (les gardes neuves des deux côtés).

**Prévenir avant** : un onglet déjà ouvert garde l'ancien jeu de droits
(`/admin/me`) jusqu'au **rechargement** de la page, et le cache serveur 30 s.
« Rechargez la page » est la consigne, pas « attendez ».

**Irréversible après le réglage à l'écran** (DG-D7) : revenir à `b2b_orders`
seul ne se fait plus automatiquement une fois que Hugo a réglé les rôles.

### 5.9 Lots v2

| Lot     | Contenu                                                                                                                   | Part avec                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **DG1** | Valeurs d'enum (migration A)                                                                                              | DG2, DG3                  |
| **DG2** | Bascule (migration B), une source par ressource, dérogations une pour une ; `ROLE_GRANTS` selon 5.2 ; e2e                 | DG1, DG3                  |
| **DG3** | Gardes API (inventaire 5.1, `admin-production.controller` scindé), panneau « Bacs » élargi, gardes et atterrissages front | DG1, DG2                  |
| **DG4** | Porte `lint:no-role-grants-in-migrations` ; tests de 5.6 ; règle du CLAUDE.md                                             | même déploiement          |
| **DG5** | Migration du livreur retirée (5.7)                                                                                        | avant toute mise en ligne |
| **DG6** | Procédure masquée (DG-D8)                                                                                                 | ensuite                   |
| **DG7** | Écran des dérogations                                                                                                     | ensuite                   |
| —       | Admin calculé                                                                                                             | **plan à part**           |

## 6. Bâti le 2026-10-01 (`8b424bb2f`) — DG0 à DG5

Migrations `20261001130000_la_cle_de_role_est_obligatoire`,
`20261001130100_les_droits_par_geste` (valeurs d'enum seules),
`20261001130200_la_bascule_des_droits_par_geste` ; porte
`lint:no-role-grants-in-migrations` (40ᵉ) ; `20261001120100_le_role_livreur`
retirée. Suite racine verte, lancée seule.

Écarts au plan, à trancher par Hugo avant la mise en ligne :

1. **Le catalogue vendable reste sous `b2b_orders`** (5.1 bis le mettait sous
   `b2b_place_order`) : `GET admin/catalog/sellable` et
   `…/companies/:companyId` servent aussi le prévisionnel, le dossier du jour,
   le simulateur de tarification et l'onglet Stats de la fiche client. Le
   support perdrait les Stats le jour J.
2. **La recopie des dérogations vers `b2b_place_order`** : tout `deny`, quelle
   que soit son action (refuser la lecture retirait déjà l'écriture), et un
   `allow` seulement sur l'écriture. Aucune dérogation concernée aujourd'hui.
3. **Le panneau « Bacs »** demandait l'écriture (`production_packing:write` ou
   `delivery_loading:write`) même pour ses lectures. **Plus vrai depuis le
   2026-10-02** : la fiche d'un bac (`GET colisage/bacs/:binId`) se lit sous
   `production_packing:read` ou `delivery_loading:read`
   (`delivery-bins.controller.ts`, l. 121-122), comme les tournées vues du
   poste (`GET colisage/tournees`, ouverte le même jour,
   `delivery-packing.controller.ts`, l. 58-59). Les bacs d'une commande, les
   moitiés libres et la proposition restent en écriture : ils sont le
   panneau du geste.
4. **`b2b_place_order` ouvre aussi le simulateur de tarification**
   (`POST admin/orders/quote`) : le retirer à la comptabilité lui ferme le
   simulateur.

**Après la mise en ligne, à l'écran** (`/admin/roles`) : créer le rôle
« Livreur » avec `delivery_driving` ; accorder `delivery_driving` à l'admin
(la migration retirée le faisait) ; appliquer la feuille de réglage
[`tableau-droits-livraison.md`](tableau-droits-livraison.md).

### Les écarts entre l'écran et l'API (relevés le 2026-10-07)

L'audit du dossier `livraisons/` a confronté les gardes du back-office à
celles des contrôleurs. Cinq écarts touchaient les droits de ce plan :
l'écran montrait un geste que l'API refusait, ou cachait ce qu'elle ouvrait.

- **« Arrêter le plan »** (`previsionnel-page.html`) n'était gardé par rien
  côté écran, alors que la route exige `production_count_stop:write` : tout
  lecteur du prévisionnel (`production_plan:read`) voyait le geste et prenait
  un 403. ✅ Corrigé le 2026-10-07 : le bouton suit
  `production_count_stop:write` (audit, F1).
- **Le poste de retrait** relit sa file sur `GET admin/orders/day-version`,
  qui n'acceptait que `b2b_orders:read` alors que l'écran n'exige que
  `handover_counter:read` : un rôle « retrait seul » prenait un 403 avalé
  toutes les 15 s, et sa file ne se relisait plus que par le journal du
  fournil et le filet de 5 min. ✅ Corrigé le 2026-10-07 : la route accepte
  aussi `handover_counter:read` (audit, B6).
- **`delivery_decisions:read` n'affiche rien** : il ouvre
  `GET admin/livraison/a-decider` (`stop-decisions.controller.ts`), et la
  fiche des rôles dit « Voir À décider » (`staff-resource-scopes.ts:221`),
  mais la route d'écran et le rail exigent l'écriture (`app.routes.ts` du
  back-office, l. 401 ; `workspaces.ts:198`). ✋ À trancher (audit, Q5) :
  ouvrir l'écran à la lecture, ou dire que ce niveau n'ouvre rien.
- **Le panneau « Procédure »** de la fiche client
  (`delivery-procedure-panel.html`) s'ouvrait en édition sans test de droit :
  après le réglage de la feuille, comptabilité et support prenaient 403 au
  premier chargement. ✅ Corrigé le 2026-10-07 : le panneau suit
  `delivery_procedures` (audit, F2).
- **« Nouvelle commande »** ne demande que `b2b_place_order:write`
  (`app.routes.ts` du back-office, l. 139), mais le catalogue vendable et
  l'historique qu'elle charge restent sous `b2b_orders:read` (écart 1
  ci-dessus, `b2b/orders/http/admin-catalog.controller.ts`). Connu ; la
  feuille de réglage le tient, puisque les trois rôles qui passent des
  commandes — admin, commercial, comptoir — gardent `b2b_orders`.

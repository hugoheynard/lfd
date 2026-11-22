# Plan — archiver un compte client qui n'a jamais servi

**État : 📝 plan, rien n'est bâti** (2026-11-17, v2 après une contradiction de
`vitruve` ; la § 6 corrige la v2 après la seconde, et **prime**). Demande de Hugo : un membre du staff a créé un client en double,
qui n'a jamais commandé ni signé de mandat, et il faut le faire disparaître.
Décisions de Hugo du même jour : pas d'effacement, un **archivage** qui le
retire des vues ; le geste vit dans la **zone de danger** de la fiche client.

Le plan touche à l'accès d'un compte : il passe par `vitruve`. Ses
affirmations sur l'existant ont été vérifiées le 2026-11-17 ; celles marquées
**à vérifier** ne l'ont pas été.

---

## 1. En simple

Sur la fiche d'un client, dans la zone de danger : **« Archiver ce compte »**,
avec une raison (« doublon de La Ferme du Col »).

- **Il n'est permis que pour un compte qui n'a jamais servi.** Sinon, le
  bouton est désarmé et dit ce qui le retient ; le geste à faire reste la
  résiliation.
- **Le compte disparaît** de la liste des clients, de la recherche et du
  cockpit commercial. Un filtre « Archivés » le montre encore.
- **Personne n'y entre plus** : ses membres ne le voient plus dans leur espace,
  ne peuvent plus y commander, et une invitation vers lui ne s'accepte plus.
- **Rien n'est effacé**, et il se **désarchive**.

## 2. Ce qui existe (vérifié le 2026-11-17)

- `CompanyStatus = pending | active | suspended | terminated`, et ses
  transitions dans l'agrégat `Company` (`account/domain/entities/company.ts`).
- **Un compte résilié n'est coupé que de la boutique**, par `companyServiceOf`
  (`catalog/domain/company-service.ts`). Ni le principal
  (`account/infrastructure/customer-principal.resolver.ts`, qui ne lit pas le
  statut des sociétés), ni `readCompanyStanding`
  (`shared/company-standing/infrastructure/read-company-standing.ts`, qui
  expose le statut sans rien refuser) ne le tiennent à l'écart. Ses membres le
  gardent dans leur espace. **Ce plan ne corrige pas ce trou pour les comptes
  résiliés** (question Q3), il ne le reproduit pas pour les comptes archivés.
- Un site est atteint par héritage du principal selon `inheritedSiteWhere`,
  qui écarte `suspended` seulement.
- **Ce qui porte un `company_id`** n'est pas seulement les relations du modèle
  `Company` : une vingtaine de fichiers `.prisma` en portent un sans relation
  (le RIB, la mercuriale et ses avenants, les engagements de volume, les
  réservations d'article, les cibles de promotion, les virements reçus, les
  prélèvements et leurs avis, les sorts de facture, les notes du commercial,
  le brouillon de commande, `growth`…).
- **La passation de commande ne verrouille pas la ligne `companies`** ; seuls
  l'adresse, le payeur et le rattachement d'un site le font (`FOR UPDATE`).

## 3. La conception

### 3.1 Une colonne, pas une valeur de statut

`archived_at` (avec `archived_by_staff_id`, `archived_by_name`,
`archive_reason`) sur `companies`, **le statut inchangé**. Pourquoi pas une
valeur `archived` de l'enum (v1) : une valeur d'enum Postgres ne se retire
plus ; elle devrait être traitée dans le contrat servi aux deux fronts, et
une quinzaine de prédicats négatifs (`!== "terminated"`, `not: "terminated"`)
la laisseraient passer sans une erreur de type. Une colonne nullable se
retire, et le désarchivage n'a rien à « rendre » : le statut n'a pas bougé.

CHECK : les quatre colonnes sont toutes nulles, ou toutes posées (raison non
vide). Les colonnes d'auteur entrent au registre RGPD.

### 3.2 « Jamais servi » : l'empreinte, lue chez chaque propriétaire

Pas une requête unique d'`account` sur les tables des autres : chaque
propriétaire publie une lecture « ce compte a-t-il servi chez moi ? »
(règle « le propriétaire parle de ce qui est à lui », CLAUDE.md § 3), et le
handler les agrège. Le lot A1 part **des tables qui portent un `company_id`**,
pas des relations du modèle, et classe chacune :

- **retient** (le compte a servi) : commandes (trois sens) et brouillon de
  commande, RIB, mandats (deux sens), formulaires et lots de prélèvement,
  liens de paiement, virements reçus, factures et leurs sorts, abonnements,
  fidélité, mercuriale et ses avenants, engagements de volume, réservations
  d'article, cibles de promotion, sites rattachés, et le compte **lui-même
  site** d'un principal (question Q1) ;
- **suit le compte** (il garde ses données, archivées avec lui) : adresses,
  contacts, membres et invitations, panier, notes du commercial, suivis,
  règles d'avis, dérogations d'heure limite, demandes de support, alertes,
  conditions accordées, `growth`.

Une table neuve qui porte un `company_id` sans être classée fait échouer une
porte (la liste vit à côté de l'empreinte).

### 3.3 Le mur : un seul endroit par chemin d'accès

- **Le principal** (`customer-principal.resolver.ts`) n'emporte plus les
  memberships d'une société archivée : elle n'est plus dans l'espace du
  membre. Le cache du principal suit déjà un `UPDATE` de `companies` par le
  déclencheur `companies_principal_stamp` ; **à vérifier** qu'il couvre la
  nouvelle colonne, sinon l'y ajouter.
- **`readCompanyStanding`** rend `null` pour une société archivée, en propre
  comme par héritage : tout lecteur de rôle (la porte
  `lint:company-role-readers` les y oblige) cesse de l'ouvrir.
- **La boutique** : `companyServiceOf` rend « fermé » pour une société
  archivée.
- **L'acceptation d'une invitation** vers une société archivée est refusée.

### 3.4 La course avec une commande

L'archivage prend `SELECT … FROM companies WHERE id = $1 FOR UPDATE`, lit
l'empreinte, puis écrit. La passation de commande prend
`SELECT archived_at FROM companies WHERE id = $1 FOR SHARE` dans sa
transaction et refuse un compte archivé. Les deux se sérialisent : une
commande passée au même instant fait soit échouer l'archivage (l'empreinte la
voit), soit est refusée. Un e2e lance les deux en parallèle. La passation
touche à l'argent : ce point est le cœur de la relecture.

### 3.5 Les vues

La liste des clients du back-office, sa recherche, le cockpit commercial et
les sélecteurs de société du staff écartent `archived_at IS NOT NULL` par
défaut. Les autres lecteurs n'ont rien à faire : un compte qui n'a jamais
servi n'a ni commande, ni facture, ni chiffre à montrer. La porte ne promet
que ce qu'elle voit : les lecteurs de **liste** de sociétés en Prisma
(`findMany`, `count`) inscrits avec leur choix ; le SQL brut et les lectures
par relation n'en sont pas.

### 3.6 L'écran

La `fold-danger-zone` de la fiche client gagne « Archiver ce compte » (raison
obligatoire, confirmation de fold). L'empreinte est lue à l'ouverture : si
elle n'est pas vide, le bouton est désarmé et dit ce qui retient. Un compte
archivé montre un bandeau (« Archivé le …, par …, raison : … ») et
« Désarchiver ». La liste gagne le filtre « Archivés ». Le droit : celui qui
permet de résilier.

## 4. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | Migration additive (colonnes, CHECK) ; l'agrégat (`archive`, `unarchive`) ; les lectures d'empreinte par propriétaire et la porte des tables à `company_id` ; les faits `company.archived` / `company.unarchived` ; `lecteur-de-migrations`. |
| **A2** | Le mur : principal, `readCompanyStanding`, boutique, invitation ; le verrou de la passation ; l'e2e de la course.                                                                                                                            |
| **A3** | Les vues et leur porte.                                                                                                                                                                                                                      |
| **A4** | L'écran (`pablo`).                                                                                                                                                                                                                           |
| **A5** | Doc d'état, plan supprimé.                                                                                                                                                                                                                   |

## 5. Questions

- **Q1** — Peut-on archiver un **site** (une société rattachée à un
  principal) ? Proposé : non, il se détache d'abord ; l'empreinte le retient.
- **Q2** — Archiver ne touche pas aux **personnes** : leur accès aux autres
  sociétés reste entier. Proposé tel quel.
- **Q3** — **Hors plan, à décider** : un compte **résilié** garde aujourd'hui
  son espace client pour ses membres. Faut-il le fermer de la même façon
  (principal et `readCompanyStanding`) ? C'est un trou de sécurité qui existe
  déjà, sans lien avec l'archivage.

---

## 6. La seconde contradiction (2026-11-17) : ce qui corrige la v2

Ce qui suit **prime** sur les §§ 2 à 4.

### Bloquants

- **Le cache du principal.** Le déclencheur `companies_principal_stamp` est
  filtré par colonnes (`UPDATE OF "id", "status", "parent_company_id"`,
  migration `20261105120000_l_estampille_filtree_par_colonnes`) : il ne
  monterait pas sur `archived_at`. **A1 le refait**, dans une nouvelle
  migration, avec `archived_at` dans `UPDATE OF`.
- **L'héritage en liste.** `inheritedSiteWhere` est lu aussi par
  `readReachableSites` et par le mur des commandes du principal
  (`orders/infrastructure/company-order-wall.ts`). **A2** y ajoute
  `archivedAt: null` sur le site **et** sur son principal, et `standingFromRow`
  refuse une société archivée en propre comme par héritage. Le rattachement
  d'une société archivée comme site est refusé.
- **Le verrou de la passation.** Le § 2 se trompait : la passation ne verrouille
  ni l'adresse, ni le payeur, ni le site ; elle prend la journée (ou la
  vitrine), puis le titulaire du bon, puis écrit (`place-order.handler.ts`).
  Trois handlers écrivent une commande (le client, le staff pour le client, la
  boutique), tous par `PrismaOrderRepository.place`. **Le verrou se pose là**,
  une fois pour les trois : `SELECT archived_at … FOR SHARE` sur `company_id`
  et sur `principal_company_id`, avant le `create`, et un compte archivé est
  refusé. L'archivage prend la seule ligne `companies` : pas d'interblocage.

### Sérieux

- **L'entrée d'un invité** accepte ses rattachements bruts sans lire la société
  (`customer-principal.resolver.ts`, `canEnter`) : `findBySub` charge
  `company.archivedAt`, et `canEnter` / l'acceptation écartent une société
  archivée. **Une personne qui n'a plus aucune société ouverte** voit l'écran
  « aucun compte » existant (à vérifier en A2).
- **L'empreinte se tire du schéma, pas d'une liste.** 47 colonnes `*company_id`
  dans 23 fichiers `.prisma` (vérifié le 2026-11-17). La porte part du motif
  `@map("…company_id")`. Les treize que la v2 omettait sont à classer, dont
  « retient » : `KnownBankAccount`, `AccountBankExportLine`,
  `PayerBillingMode`, `PayerCollectionMeans`, `BillingStatement`,
  `CollectionTest`, `CollectionNotice`, `MercurialeDraft`,
  `Promotion.audience_company_id`, `OrderOpeningExemption` ; et « suit le
  compte » : `DeliveryProcedure`, `OwnEstablishment`, `CompanyTermination`.
  A1 chiffre le nombre de propriétaires, donc de lectures d'empreinte.
- **Ce que la porte ne voit pas** : les identifiants de société dans les
  `jsonb`, les faits du journal et les demandes d'e-mail. Elle ne tient que les
  colonnes.
- **Les producteurs automatiques** (alertes de compte dormant, relances
  d'onboarding, `growth`) visent justement un compte vide : **A3** les
  inventorie et leur fait écarter un compte archivé.
- **Le CHECK** ne lie que `archived_at` et `archive_reason` ; l'identifiant et
  le nom de l'auteur restent nullables, comme `activated_by_staff_id`. La durée
  de conservation du nom se décide avec le registre RGPD.
- **L'irréversible** : le déclencheur refait en A1 ne se corrige que par une
  autre migration.

### Mineurs

- Le droit du geste : la ressource `StaffResource` qui permet de résilier, à
  nommer en A1.
- À vérifier en A1 : si `lint:context-version-columns` lit `companies`.

## 7. Décisions de Hugo (2026-11-17)

- **Q1 — non** : un **site** rattaché à un principal ne s'archive pas ; il se
  détache d'abord. L'archivage refuse une société dont `parent_company_id` est
  posé, et le rattachement refuse une société archivée.
- **Q2 — oui** : archiver ne touche pas aux personnes ; elles gardent l'accès à
  leurs autres sociétés.
- **Q3 — oui** : **le même mur ferme les comptes résiliés.** Partout où le plan
  dit « une société archivée » pour l'accès (principal, entrée d'un invité,
  `readCompanyStanding`, `inheritedSiteWhere`, boutique), il faut lire « une
  société archivée **ou résiliée** ». Le verrou de la passation refuse les deux.
  Le statut `terminated` existant et la colonne `archived_at` sont les deux
  conditions du même prédicat, écrit une seule fois (« la société est fermée »)
  et lu par tous ces murs. Les comptes déjà résiliés en production perdent
  l'accès de leurs membres au déploiement : **à compter avant de livrer** (combien
  de comptes résiliés ont des membres actifs), et à annoncer.

## 8. Décisions de Hugo (2026-11-22) — ce qui prime sur tout le reste

- **Le geste s'appelle « Supprimer le compte »** à l'écran. C'est un soft
  delete : le modèle garde `archived_at` et ses colonnes (§ 3.1), rien n'est
  effacé. Il se distingue de la **résiliation** (à la demande du client, par
  exemple), qui laisse le compte dans la liste.
- **Le motif est obligatoire**, choisi dans une courte liste (« Doublon »,
  « Créé par erreur ») ou « Autre » avec un texte.
- **Une seule chose retient : une commande.** « Jamais servi » se réduit à
  « aucune commande, dans aucun sens » (commandes du compte, passées pour lui
  comme site, ou dont il est le payeur ; un brouillon ne compte pas). Le
  reste de l'empreinte du § 3.2 et du § 6 (RIB, mandat, mercuriale, factures…)
  **ne retient plus** : la porte des colonnes `*company_id` n'a plus lieu
  d'être. La lecture « ce compte a-t-il des commandes ? » est publiée par le
  propriétaire des commandes.
- Le reste tient : le mur (§ 3.3, § 6, § 7 Q3 — résiliés fermés aussi), le
  verrou de la passation, les vues, Q1 (un site ne se supprime pas).
- **Un principal qui a des sites rattachés ne se supprime pas** : on détache
  d'abord ses sites (le pendant de Q1). Refus en clair : « Ce compte a des
  sites rattachés : détachez-les d'abord. » Le geste prend le verrou de la
  hiérarchie avant celui de la ligne, et un compte supprimé ne se rattache
  plus ni comme site, ni comme principal.
- **Un espace déclaré injoignable est refusé.** Quand l'en-tête d'espace
  désigne une société que la personne n'atteint plus (fermée, plus membre, ou
  jamais), la requête ne retombe plus en silence sur une autre société ni sur
  l'espace personnel : « Ce compte n'est plus accessible. » (403). Le refus
  est porté par `@ActingCompany` : une route qui n'agit pour aucune société
  (`GET /me`, le choix de l'espace) répond encore, pour que l'écran puisse
  quitter l'espace.
- **Une invitée vers une société fermée a son propre refus** : « Ce compte a
  été fermé : l'invitation ne peut plus être acceptée. » (403), sans le fait
  « invitation expirée » au journal ni l'alerte à l'équipe.
- **Le verrou de la passation prend aussi le payeur** (`billed_company_id`),
  dédoublonné avec la société et son principal, trié par identifiant ; un
  payeur fermé est refusé.

## 9. Les vues (A3, bâti le 2026-11-22) — lecteur par lecteur

Un compte **supprimé** (`archived_at` posé) sort des vues du staff ; un compte
**résilié** y reste (Hugo, 2026-11-22) — d'où `archivedAt` seul, et pas le
prédicat de fermeture `openCompanyWhere`, qui est celui des murs. Un lecteur
qui part d'une commande, d'une facture ou d'un prélèvement n'a rien à faire :
un compte supprimé n'en a pas (§ 8).

La porte `company-archived-views` tient la règle : tout
`company.findMany|count|groupBy|aggregate` nomme `archivedAt` (ou un prédicat
qui le porte) dans son `where` de premier niveau, ou son fichier est inscrit
avec le nombre de ses appels et la raison. Elle ne voit ni `findUnique` /
`findFirst`, ni le SQL écrit à la main, ni les identifiants de société lus
dans un autre modèle (journal, notes).

| Lecteur                                                                                                                        | Vue                                          | Choix                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `account/…/prisma-admin-company.reader.ts` (`listAll`)                                                                         | liste des comptes, recherche, sélecteurs (¹) | **écarte** ; `GET /admin/companies?archived=only` ne rend que les supprimés              |
| même lecteur, `byId`                                                                                                           | fiche                                        | non : la fiche d'un supprimé s'ouvre, avec son bandeau                                   |
| `get-customer-portfolio.handler.ts`, `export-customers-csv.handler.ts`                                                         | portefeuille, export CSV                     | **écartent** (portée `listed`)                                                           |
| `prisma-company-warnings.counter.ts`                                                                                           | compteur d'avertissements du menu            | **écarte**                                                                               |
| `prisma-customer-access-overview.reader.ts`                                                                                    | accès clients                                | **écarte**                                                                               |
| `prisma-counter-customer.reader.ts` (`listActive`, `activeCard`)                                                               | cartes du Comptoir                           | **écarte**, même resté `active`                                                          |
| `prisma-direct-debit-block.reader.ts`                                                                                          | blocages du prélèvement                      | **à écarter, laissé intact** : fichier des prélèvements tenu par une autre session       |
| `growth/…/prisma-sales-sheet.reader.ts` (fiches, suiveurs)                                                                     | suivi commercial                             | **écarte**                                                                               |
| `growth/…/prisma-sales-day.reader.ts` (`openedOn`)                                                                             | ouvertures du jour                           | **écarte** : un doublon n'est pas une ouverture                                          |
| même lecteur, `touched`                                                                                                        | gestes du jour                               | non : un contact noté reste un geste fait                                                |
| `prisma-market-sectors.reader.ts`, `prisma-market-adoption.reader.ts`                                                          | secteurs, adoption                           | **écartent**                                                                             |
| `prisma-portfolio-metrics.reader.ts`                                                                                           | métriques du portefeuille                    | **écarte** (actifs, activés sur 30 j)                                                    |
| `prisma-activation.reader.ts`                                                                                                  | tunnel d'activation                          | **écarte** par `ArchivedCompaniesReader` (lecture par lot)                               |
| `recompute-lead-scores.handler.ts`                                                                                             | cockpit (calcul)                             | **écarte** ses faits avant le calcul                                                     |
| `get-cockpit.handler.ts`                                                                                                       | cockpit (lecture)                            | **écarte** : le read-model date du dernier recompute — un coup de moins jusqu'au suivant |
| `prisma-company-namer.ts`                                                                                                      | noms des faits du journal                    | non : un fait passé garde son nom                                                        |
| `prisma-promotion-company-status.reader.ts`                                                                                    | publics des promotions                       | lit `isCompanyClosed` : une société fermée répond `terminated`, jamais « pro actif »     |
| `promotion-meeting.ts`                                                                                                         | rencontre de deux publics                    | ses statuts « qui commandent » se dérivent de `CLOSING_STATUS`                           |
| `client-notes/…/prisma-notebook-companies.ts`                                                                                  | notes du commercial                          | non : la fiche d'un supprimé s'ouvre, ses notes avec                                     |
| `prisma-account.reader.ts` (sites atteints), `read-company-standing.ts`                                                        | espace client                                | non : déjà fermés par le mur (A2, `openCompanyWhere`)                                    |
| `company-hierarchy.projection.ts`, `prisma-statement-billing.reader.ts`                                                        | sites d'un principal                         | non : un supprimé n'est jamais site, ni principal à sites                                |
| `accounting/…` (impayés, facturation, candidats, acheteur, payeurs, établissements), `loyalty`, `catalog/…made-to-order-admin` | noms par identifiants d'un fait              | non : un supprimé n'a ni commande, ni facture, ni prélèvement                            |
| `prisma-company-opener-backfill.ts`, `dev/seeding/*`                                                                           | rattrapage, semis                            | non                                                                                      |
| alertes de compte (`alerts/`), avis aux sous-comptes                                                                           | producteurs automatiques                     | non : les alertes partent des commandes ; les avis visent les sites d'un principal       |
| calendrier commercial (rendez-vous)                                                                                            | agenda                                       | non : un rendez-vous pris est un engagement daté, il s'annule à la main                  |

(¹) La recherche, le ciblage de promotion et le rattachement d'un site
filtrent côté écran la liste `GET /admin/companies` ; la saisie de commande lit
les cartes du Comptoir (`listActive`, écarté aussi). Vérifié le 2026-11-22 dans
`apps/lfd-backoffice-frontend/src/app/` (`company-search`,
`promotion-audience-tree`, `attach-sub-account-panel`, `order-entry-sources`) ;
le sélecteur de titulaire n'a pas été ouvert.

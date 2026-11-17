# Plan — archiver un compte client qui n'a jamais servi

**État : 📝 plan, rien n'est bâti** (2026-11-17, v2 après une contradiction de
`vitruve`). Demande de Hugo : un membre du staff a créé un client en double,
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

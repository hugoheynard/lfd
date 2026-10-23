# Plan — S6 : le détenteur d'un principal entre dans ses sites

> **Doc-first, 2026-10-23.** Hugo : « lance S6 ». Reprend la conception
> « À faire — S6 » de [`sous-comptes.md`](sous-comptes.md) §3, contredite par
> `vitruve` le même jour (3 bloquants, 6 sérieux) : **ce plan la remplace**.
> Frontière de sécurité (mur tenant, résolution d'accès). **Lot serveur
> bâti le 2026-10-23** (non commité à l'écriture, §5) ; lot boutique à faire.

## 0. Ce qui existe (ouvert le 2026-10-23)

- La règle est écrite et testée, jamais importée :
  `b2b/account/domain/services/effective-role.ts` — rôle effectif dans X =
  membership(X), sinon min(membership(P), admin) si X.parent = P et ce rôle ∈
  {owner, admin}, sinon aucun ; le cumul se fait par MAX.
- **Le mur n'a pas deux voies mais une dizaine** : `resolveCompany`
  (`platform/auth/resolve-company.ts`), puis un lecteur de rôle par contexte,
  chacun sur `openingMembership` (10 fichiers l'importent, 37 handlers appellent
  un `roleOf`) — passation et devis (`prisma-order-guard.reader.ts`), compte
  bancaire, impayés, fidélité, alertes, compte, annulation, abonnements, et
  l'accès C1 aux commandes des sites (`prisma-order-access.reader.ts`), qui
  recopie déjà la condition « principal actif, membership acceptée ».
- `resolveCompany` sert d'office **le seul rattachement** d'une personne ; une
  requête sans société déclarée ni rattachement unique retombe sur `null`, qui
  ouvre le **prix public** (hors mercuriale, hors engagement).
- Les gestes d'équipe (inviter, détenteur, rattacher / détacher) n'existent
  **que côté staff**.

## 1. Les règles

- **R1 — Une seule requête de rôle effectif**, dans `b2b/shared/` (le dossier
  partagé du bloc commerce, `CLAUDE.md` §3) : (personne, société) → rôle
  effectif, membership propre ou héritée, avec ses conditions (membership
  acceptée, principal **actif**, site lié au principal, site non suspendu).
  **Tous** les lecteurs de rôle du §0 la lisent ; aucun ne recopie la
  condition. L'accès C1 (`accessToOrder`) devient un de ses lecteurs.
- **R2 — Ce que donne l'héritage** : le rôle du principal plafonné à `admin`,
  comme `effectiveRole`. _(Voir Q1 pour les factures et le compte bancaire.)_
- **R3 — Jamais dans l'autre sens** : une membership de site ne donne rien sur
  le principal ni sur les sites frères.
- **R4 — La société par défaut ne change pas** : « le seul rattachement sert
  d'office » ne compte que les memberships **propres**. Un principal qui
  n'avait qu'elle garde son prix sans rien déclarer ; entrer dans un site
  passe toujours par le sélecteur, qui déclare la société. Un e2e vérifie que
  le prix servi sans en-tête ne change pas pour un principal existant.
- **R5 — Le sélecteur** de la boutique liste les memberships propres et les
  sites atteignables (« via HIP HIDEOUTS »). Une commande passée depuis un site
  est la commande du site : payeur, prix, adresses, heure limite du site.
- **R6 — Détacher ou suspendre** coupe l'accès hérité à la requête suivante
  (le principal est relu en base à chaque requête).
- **R7 — Les notifications et courriels « aux membres » d'un site** restent
  ceux de ses memberships propres. _(Voir Q2.)_
- **R8 — Hors de S6** : les gestes d'équipe côté client (inviter, détenteur,
  rattacher). Ils n'existent pas côté client ; ils feront un lot à part.

## 2. Décisions de Hugo (2026-10-23)

- **Q1 — oui** : le **détenteur** du principal, entré dans un site, voit les
  factures, les impayés et le compte bancaire du site ; un **admin** hérité,
  non. L'héritage du détenteur porte donc les droits de lecture de la
  facturation, en plus du plafond `admin` ; aucun geste réservé au détenteur
  du site (transfert, second détenteur) ne lui est ouvert.
- **Q2 — les courriels se paramètrent sur la page du sous-compte** (« je crois
  qu'on a déjà ça ») : vérifier les avis de sous-compte existants
  (`b2b/sub-account-notices/`, réglages par sous-compte) ; si le réglage
  existe, R7 le lit ; sinon, le dire avant de bâtir.
- **Une porte verrouille la frontière** (« on doit verrouiller ça avec un
  lint ») : `lint:company-role-readers` refuse toute lecture de rôle d'une
  personne dans une société (`membership` / `openingMembership` / `roleOf`
  sur Prisma) hors de la requête partagée de R1, sur le modèle des portes
  `subject-readers` et `prisma-model-ownership`. Un nouveau lecteur qui lirait
  les memberships à sa façon échoue, en nommant la requête à utiliser.

## 3. Les tests qui tiennent la frontière

Pour **chaque** lecteur de rôle du §0 : l'héritier entre ; un frère n'entre
pas ; un membre de site n'entre pas au principal ; après détachement, plus
rien ; principal inactif, plus rien. Un e2e par lecteur, faute de quoi le
premier oublié devient la fuite.

## 4. Taille

Au moins quinze fichiers serveur (la requête partagée, une dizaine de
lecteurs, `resolve-company.ts`, le résolveur du principal), le sélecteur de la
boutique, et les e2e. Un lot serveur, puis un lot boutique.

## 5. État (2026-10-23) — lot serveur bâti

- **R1** : `b2b/shared/company-standing/` — `effectiveRole` (déplacée depuis
  `b2b/account/`), `standingRole` (les gestes), `billingReadingRole` (Q1), et
  la requête `readCompanyStanding` (+ `inheritedSiteWhere`,
  `readReachableSites`). Lecteurs branchés : `PrismaMembershipReader`
  (37 handlers, dont `SubscriptionGestures`), `PrismaOrderGuardReader`,
  `PrismaOrderAccessReader`, `PrismaCancellingMemberReader`,
  `companyOrderWallOf`, `PrismaUnpaidAccessReader`,
  `PrismaBankAccountGuardReader` (gestes) et `PrismaBankAccountReadingGuard`
  (lecture, nouveau port), `PrismaLoyaltyConversionGate`,
  `PrismaAlertCompanyReader`.
- **R4** : le `Principal` porte `reachableCompanyIds` à côté de
  `memberships` ; `resolveCompany` sert un site atteint s'il est déclaré, et
  « le seul rattachement » ne compte que les propres.
- **R5 (part serveur)** : `GET /me` rend `reachableSites` (« via » le
  principal) ; `PATCH /me/nav-prefs` admet un site atteint comme espace.
- **R7 / Q2** : le réglage existe, mais PAS par sous-compte — les avis au
  principal (`b2b/sub-account-notices/`) se règlent par PRINCIPAL, côté
  staff seulement (`/admin/companies/:id/sub-account-notices` : interrupteur
  - tableau sorte d'avis × rôle), et vont à ses memberships acceptées
    (`AcceptedMembersReader`, vérifié le 2026-10-23). Rien n'y est changé :
    l'héritier ne reçoit pas les courriels des memberships du site, et la page
    client du sous-compte n'a aucun réglage. À trancher par Hugo s'il le veut.
- **Porte** : `lint:company-role-readers`.
- **Tests** : `company-standing.spec`, `standing-from-row.spec`,
  `resolve-company.spec` ; e2e `company-standing-readers`,
  `company-standing-workspace` (à faire tourner : la base de test était en
  retard d'une migration d'un autre chantier). Deux tests de
  `site-orders-from-principal` sont retournés : le devis et la passation au
  nom d'un site s'ouvrent (R5), et un site suspendu n'est plus lu par
  l'héritier (R1).
- **Ouvert** : un site suspendu ferme l'héritage, lecture comprise — C1
  (§7.7 de `plan-commandes-des-sites.md`) le laissait lire. À confirmer.

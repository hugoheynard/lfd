# Plan — les commandes des sites dans la boutique du principal

> **Doc-first, 2026-10-21.** Rien n'est bâti. Demandé par Hugo le 2026-10-21 :
> « voir la page mes commandes avec les sites ». C'est une partie du lot **S6**
> de [`sous-comptes.md`](sous-comptes.md) (« côté client », 🟡 à faire),
> limitée aux COMMANDES. Déplace une frontière de sécurité (le mur tenant) :
> contredit par `vitruve` avant d'être soumis. **Contredit le 2026-10-21 :
> quatre BLOQUANTS ; le §7 l'emporte sur les §1 à §5 là où ils divergent.**

## 0. Ce qui existe (ouvert le 2026-10-21)

- **La société d'une requête** vient de l'en-tête de l'espace de travail
  (`WORKSPACE_HEADER`, `platform/auth/auth.guard.ts`), résolue par
  `resolveCompany(principal.memberships, …)` (`platform/auth/resolve-company.ts`)
  — parmi les rattachements PROPRES de la personne. Un membre du principal
  n'a aucun rattachement aux sites : il ne peut pas y basculer.
- **La liste** `GET /companies/:companyId/orders`
  (`orders/http/company-orders.controller.ts`) → `ListCompanyOrdersHandler`
  → `PrismaOrderReader.listByCompany` : `where { companyId }`. Aucune notion
  de site.
- **Le mur d'une commande** : `OrderGuardReader.roleOf(userId, companyId)`
  (`orders/infrastructure/prisma-order-guard.reader.ts`, membership propre)
  puis `isOrderVisible` (`orders/domain/services/order-access.ts`) : commande
  d'entreprise visible de TOUT membre, quel que soit son rôle ; refus = 404.
  Repris par le détail, le bon, le PDF, le règlement et le signalement
  (`contact/infrastructure/order-reportable-order.reader.ts`).
- **L'annulation** a son propre mur : `PrismaCancellingMemberReader.mayCancelFor`
  (membership acceptée, société active, « sans héritage vers les sites »).
- **La règle d'héritage existe, débranchée** :
  `b2b/account/domain/services/effective-role.ts` — seuls `owner` et `admin`
  du principal héritent, plafonnés à `admin` dans le site ; un rôle propre
  plus haut l'emporte (MAX) ; jamais dans l'autre sens. « PAS ENCORE
  BRANCHÉE (S6) ». Décidée par Hugo le 2026-10-05.
- **`orders.principal_company_id`** est une copie figée à la passation, lue
  par les avis (N1–N4e) ; elle ne sert pas au mur.
- **Les avis au principal** excluent déjà l'auteur
  (`sub-account-notices/domain/notice-recipients.ts`) : un membre du principal
  qui agit sur une commande d'un site ne se prévient pas lui-même.
- **Verrouillé par e2e** : « membre de la société mère sans rattachement au
  site → 404 » (`test/order-customer-cancel.e2e-spec.ts`). Ce test CHANGE de
  sens avec ce plan pour `owner`/`admin` du principal.
- **Inexistant** côté client : modifier une commande, QR de retrait, noter.

## 1. Ce qu'on bâtit

- **Le principal** (son `owner` ou son `admin`) voit dans « Mes commandes »
  ses commandes ET celles de ses sites, avec une colonne « Site » et un
  filtre par site ; il ouvre une commande d'un site et y fait les MÊMES
  gestes qu'un admin du site : annuler, régler, signaler un problème, bon et
  PDF (Hugo, 2026-10-21 : « lecture et gestes »).
- **Un site** voit ses commandes seulement — y compris celles que le
  principal a passées POUR lui (elles portent le site comme société), avec
  « passée par [principal] ». Ni les commandes des autres sites, ni celles du
  principal pour lui-même (Hugo, 2026-10-21, et Q2 du 2026-10-05).

## 2. Les règles

- **Une seule règle d'accès** : le rôle EFFECTIF d'une personne dans la
  société de la commande = `effectiveRole(membership propre, membership dans
le principal de cette société)`. Branchée UNE fois, dans le lecteur de rôle
  des commandes (`OrderGuardReader.roleOf`), et lue par TOUS les gestes —
  y compris le mur d'annulation, qui cesse d'avoir sa propre règle.
- **La liste agrégée** : `GET /companies/:principalId/orders?site=…` — les
  commandes du principal et de ses sites ACTUELS, chacune avec son site ; le
  mur est dans la requête (`company_id IN (principal, sites dont parent =
principal)`), jamais filtré après coup. Pour un rôle effectif sans héritage
  (`orders`, `billing` du principal), la liste reste celle du principal seul.
- **« Passée par »** : une commande d'un site dont l'auteur n'est pas membre
  du site mais l'est du principal porte le nom du principal.
- **Détacher coupe** : un site détaché n'a plus de principal ; l'héritage
  tombe à la lecture suivante (le parent est lu en base à chaque requête).
- **Les avis** : un geste d'un membre du principal sur une commande d'un
  site garde l'auteur exclu des destinataires — rien à changer, à éprouver.

## 3. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                                                                                                                                                                   | Agent     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **C1** | Serveur : `roleOf` lit `effectiveRole` (membership propre + rôle dans le principal, en UNE lecture) ; le mur d'annulation s'y range ; la liste agrégée avec `site` et le filtre ; « passée par » ; e2e : owner/admin du principal lit et agit sur un site, `orders`/`billing` du principal NON, un site ne voit ni le principal ni ses frères, détacher coupe, l'auteur n'est pas prévenu | batisseur |
| **C2** | Boutique : colonne et filtre « Site » dans « Mes commandes » du principal, « passée par » côté site ; les gestes d'une commande d'un site depuis le principal                                                                                                                                                                                                                             | pablo     |

## 4. Hors périmètre

- Basculer l'espace de travail dans un site (sélecteur) : le principal agit
  sur la commande, pas « dans » le site.
- Commander pour un site depuis le principal (R8) : autre chantier.
- Les autres ressources d'un site (adresses, contacts, factures) : S6 complet.

## 5. Questions ouvertes

- **Q1** — Les membres `orders` du principal (un acheteur central) : la règle
  du 2026-10-05 ne leur donne rien sur les sites. La garder, ou leur ouvrir la
  LECTURE des commandes des sites ?
- **Q2** — Annuler la commande d'un site depuis le principal : le mail
  d'annulation part-il au site (son auteur), comme une annulation par le
  site ?

## 6. Décisions (Hugo, 2026-10-21)

- Le principal voit et agit (« lecture et gestes »).
- Un site ne voit que ses commandes, y compris celles que le principal a
  passées pour lui.

## 7. Révision après `vitruve` (2026-10-21) — l'emporte

**7.1 Deux murs, pas un (BLOQUANT 1).** `OrderGuardReader.roleOf` garde aussi
la PASSATION (`place-order.handler`), le DEVIS (`quote-order.handler`, société
prise dans le corps) et la passation par l'équipe
(`place-order-for-customer.handler`). L'héritage n'y entre PAS : commander
pour un site reste hors périmètre (R8). Une méthode distincte —
`accessToOrder(userId, order)` — porte l'héritage et sert les gestes sur une
commande EXISTANTE seulement ; `roleOf` reste la membership propre.

**7.2 Ce qu'il faut pour hériter (BLOQUANT 2).** Le rôle hérité exige une
membership du principal ACCEPTÉE et un principal ACTIF ; l'invitation vivante
non acceptée, admise par `openingMembership` pour la membership propre,
n'ouvre RIEN sur les sites. L'annulation garde ses conditions
(`prisma-cancelling-member.reader.ts` : acceptée, société de la commande
active) appliquées à la chaîne effective ; ses e2e B2 et invitation ne
changent pas de sens.

**7.3 La société d'un geste (BLOQUANT 3).** Pour un geste sur une commande
existante, la société qui fait foi est celle de la COMMANDE, jamais l'espace
de travail (`ActingCompany`) : le signalement prend l'audience et le
`companyId` de la demande sur la commande (le site). Chaque fait émis par un
geste porte la société de la commande et l'auteur du geste — vérifié fait par
fait en C1.

**7.4 L'inventaire des murs (BLOQUANT 4).** Passent par `accessToOrder` :
détail, bon, PDF, règlement (le payeur reste celui de la commande,
`order-settlement`), abandon, annulation, signalement. RESTENT sur leur mur
propre, et c'est assumé : factures et impayés (`prisma-unpaid-access.reader`
— le principal ne voit pas les factures d'un site ; la commande d'un site
n'affiche pas de lien vers une facture qu'il ne peut ouvrir), RIB et mandat
(`prisma-bank-account-guard.reader`), abonnements (`subscription-gestures`).

**7.5 « Mes sites »** : pour la liste et l'accès, le parent ACTUEL fait foi
(sécurité : détacher coupe). `principal_company_id` reste ce qu'il est — une
copie pour les avis, pas une autorisation. La liste agrégée porte le même
`IN` sur la liste, le `count` et la pagination, avec un e2e de comptage.

**7.6 « Passée par »** : au lieu d'une déduction sur des memberships qui
changent, la commande d'un site affiche le NOM de son auteur
(`placed_by_user_id`), qui est un fait figé ; « l'équipe » pour une commande
passée par le staff.

**7.7 Site suspendu** : le principal voit ses commandes ; les gestes suivent
la même règle de statut que pour un membre du site (annulation refusée).

**7.8 Q1 tranchée par le code** : `effectiveRole` exclut `orders` et
`billing` du principal ; on garde la règle. **Q2** se vérifie dans le
handler d'annulation en C1 : le mail part à l'auteur de la commande et aux
destinataires habituels du site.

**Irréversibilité** : tout futur geste sur une commande existante devra
passer par `accessToOrder` ; le JSDoc d'`effectiveRole` (qui annonce deux
autres voies) est corrigé en C1.

**7.9 La source d'une annulation (Hugo, 2026-10-21)** : quand c'est le compte
principal qui annule la commande d'un site, le mail d'annulation au site et le
suivi de la commande le DISENT — « annulée par [nom], du compte principal
[enseigne du principal] ». Même mention dans l'historique de la commande vu par
le site et par l'équipe. Une annulation par un membre du site garde son texte.

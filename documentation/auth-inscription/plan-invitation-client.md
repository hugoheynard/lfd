# Inviter un contact depuis Mon compte

> Écrit le 2026-09-14 à la demande de Hugo. **Frontière de sécurité** : un client
> ouvrirait l'accès à l'espace de sa société (`CLAUDE.md` §9 bis). Première
> version contredite par `vitruve` le même jour (3 BLOQUANT, 7 SÉRIEUX) ; celle-ci
> la remplace. **Rien de ce qui suit n'est construit**, sauf le Lot 0, en cours.

## 0. La demande

Dans Mon compte, sous chaque **contact** (pas sous le détenteur), un lien
**« Envoyer une invitation »** — « Renvoyer l'invitation » tant qu'elle attend,
rien une fois la personne entrée.

## 1. Ce qui existe (vérifié le 2026-09-14)

- **Staff seulement** : `POST /admin/companies/:companyId/members`
  (`admin-company-members.controller.ts`) → `InviteCompanyMemberHandler` →
  `AccountAccessGranter.grant` (`grant-account-access.service.ts`). `grant`
  cherche un compte par adresse (`findAccountByEmail`, insensible à la casse) et
  **rattache d'office** : identité neuve + lien (`customer.access-opened`), nouveau
  lien si `invited`, rattachement direct si actif (`customer.company-attached`).
  **Aucun fait n'est écrit au journal** par ce chemin.
- **`users.email` n'est unique nulle part** ; un compte créé à la première
  connexion (`customer-principal.resolver.ts`, `provision`) est `active` avec
  l'adresse du jeton, **prouvée ou non** (`users.email_verified` est recopié à
  part).
- **L'état d'accès d'un interlocuteur existe déjà** :
  `contactAccessSchema = none | invited | expired | active` et
  `CompanyContactView` (`packages/contracts/src/company-member.ts`), calculés par
  `projectContacts` (`company-contacts.projection.ts`) — rapprochement sur
  l'adresse normalisée, échéance par `isInvitationExpired` (7 jours depuis le 2026-09-18, 14 avant —
  `platform/shared/invitation/invitation-expiry.ts`). **Lu par le staff
  seulement.** Côté client, `/me` sert `ContactView`, sans accès, à **tous** les
  membres de la société, quel que soit leur rôle (`prisma-account.reader.ts`).
- **Contacts client** : `POST/PATCH/DELETE /companies/:companyId/contacts[/:contactId]`,
  murés par `ensureCompanyAdmin` (owner/admin). `RemoveCompanyContactHandler` ne
  retire que la ligne du carnet : **un accès rattaché survit**.
- **`users.invited_by`** : documenté « id du STAFF » (`account.prisma`), écrit
  seulement à la création d'un compte.
- **Throttler** : **300**/min par IP par défaut (`security.module.ts`) ; des routes
  publiques le serrent à 60 par `@Throttle`.
- **Gabarits** `customer.access-opened` et `customer.company-attached`
  (`platform/mailer/mail-templates.ts`) disent « par l'équipe La Folie Douce » ;
  le second promet « répondez, nous le retirerons ».
- **Rôles** : `owner | admin | orders | billing` ; `owner` ne s'attribue pas.
  Statuts de société : quatre valeurs, dont `suspended` et `terminated`.

## 2. Décisions de Hugo (2026-09-14)

| Sujet                               | Décision                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Qui invite                          | Détenteur et admin (`ensureCompanyAdmin`)                                                     |
| Quel rôle                           | Le rôle posé sur le contact ; jamais `owner` ; rôle `null` → refus nommé                      |
| Statut de la société                | En attente ou active : oui. **Suspendue ou résiliée : non**                                   |
| Lien                                | Envoyer / Renvoyer / rien                                                                     |
| Compte déjà existant                | **Jamais de rattachement d'office** : une **invitation en attente**, acceptée par la personne |
| Supprimer un contact qui a un accès | **Retire aussi son accès** (jamais le détenteur), après une confirmation qui le dit           |
| Failles B1 / B2 (déjà en prod)      | **Corrigées d'abord** — Lot 0                                                                 |

## 3. Lot 0 — les deux failles existantes (en cours)

- **B2** : un rattachement `owner` n'est jamais modifié par `alignRole` ni par la
  branche `update` de `attach` — tenu en base. Aujourd'hui un admin client
  rétrograde le détenteur en notant un contact à son adresse de connexion.
- **B1** : `grant` refuse (409 nommé) de rattacher un compte actif dont l'adresse
  n'est pas prouvée. Aujourd'hui une adresse posée sans preuve capte l'accès
  destiné à sa vraie propriétaire.

## 4. Le modèle : l'invitation est une chose, l'accès en est une autre

Aujourd'hui « inviter » EST « rattacher ». C'est ce qui rend possibles le
rattachement sans accord, l'oracle d'existence et l'élévation par l'adresse. Le
client n'écrira **jamais** un rattachement : il écrit une **invitation**, et
seule la personne invitée la change en accès.

**Table `company_invitations`** (schéma `public`, migration **additive**) :

| Colonne                                                   | Rôle                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `id`, `company_id` (FK)                                   | —                                                                              |
| `contact_id` (FK, `ON DELETE SET NULL`)                   | le contact dont elle vient ; sa suppression révoque (§5.4)                     |
| `email`                                                   | **normalisée** (`EmailAddress`) — la clé d'acceptation                         |
| `role`                                                    | `CustomerRole`, contrainte `role <> 'owner'` en base                           |
| `status`                                                  | `pending                                                                       | accepted | revoked` (l'expiration se calcule) |
| `invited_by_user_id` (FK users) / `invited_by_staff_sub`  | l'auteur, l'un **ou** l'autre (contrainte) — `users.invited_by` reste au staff |
| `last_sent_at`, `created_at`, `accepted_at`, `revoked_at` | échéance et limite d'envoi                                                     |

Index unique partiel `(company_id, email) WHERE status = 'pending'` : deux clics
simultanés ne font qu'une invitation.

## 5. Lot A — API

### 5.1 Inviter

`POST /companies/:companyId/contacts/:contactId/invitation` — **sans corps**,
`@Throttle` serré (10/min).

Ordre des refus : non-membre **404** → rôle ni owner ni admin **403** → société
`suspended`/`terminated` **409** → contact d'une autre société **404** → rôle
`null` **409** (« précisez d'abord son rôle ») → déjà membre de la société
**409** (« cette personne a déjà accès ») → **limites** **429** : une invitation
par contact toutes les 10 minutes, 20 par société par jour, lues sur
`last_sent_at` en base.

Puis, **dans cet ordre** :

1. écrire ou raviver l'invitation `pending` (`last_sent_at = now`) et le fait au
   journal, dans une unité de travail ;
2. **hors transaction**, préparer le canal selon le compte trouvé par adresse —
   sans jamais le rattacher :
   - inconnu → identité provisionnée + compte `invited` **sans rattachement** +
     lien de mot de passe dans `customer.colleague-invited` ;
   - `invited` (créé par nous) → nouveau lien, même gabarit ;
   - actif → `customer.colleague-invited-existing` : « X vous invite à rejoindre
     Société ; connectez-vous pour accepter » ;
   - `disabled` → **rien n'est envoyé** ;
3. répondre **202 sans corps**, quel que soit le cas.

**La réponse ne dit rien** : ni l'issue, ni `mailSent`, ni si le compte existe. Un
envoi raté se voit au journal et côté staff, pas par le client — c'est le prix de
l'absence d'oracle, et il est assumé.

### 5.2 Accepter

- `GET /me/invitations` : les invitations `pending`, non expirées, dont l'adresse
  est celle du compte **et prouvée** (`email_verified`). Rien sinon.
- `POST /me/invitations/:id/accept` : revérifie tout (adresse prouvée, `pending`,
  non expirée, société ni suspendue ni résiliée, rôle ≠ owner), écrit le
  rattachement **et** `accepted`, dans une unité de travail, avec le fait.
- `POST /me/invitations/:id/decline` : `revoked`, fait écrit.
- **Compte créé par l'invitation** (`invited`, jamais connecté) : à sa première
  requête authentifiée, adresse prouvée par le jeton, ses invitations `pending`
  sont acceptées d'office — il a posé son mot de passe depuis ce lien.

### 5.3 Lire l'état, pour qui gère

`GET /companies/:companyId/contacts/access` — **owner/admin seulement** — rend
`{ contactId, access }[]` par la projection existante (`projectContacts`),
étendue aux invitations : `invited`/`expired` depuis `company_invitations`,
`active` depuis les rattachements. Un compte existant n'apparaît `active`
**qu'après acceptation** : la lecture ne révèle rien que l'invitation n'a pas
produit. `ContactView` et `/me` ne changent pas.

### 5.4 Retirer

- **Supprimer un contact** : dans une unité de travail, révoquer ses invitations
  `pending` et retirer le rattachement de la personne à son adresse — **jamais**
  `owner`, **jamais** le demandeur lui-même (409 nommé) ; faits écrits.
- **Changer l'adresse d'un contact** qui a un accès ou une invitation en cours :
  **refusé 409** (« retirez-le puis ajoutez la nouvelle adresse ») — sans quoi
  l'ancien accès survit sous un nom qui ne le dit plus.
- **Changer le rôle** d'un contact : aligne le rattachement existant (Lot 0 garde
  le détenteur) et l'invitation `pending`.

### 5.5 Journal

Faits nommés dans `account-facts.ts`, écrits par `publishTraced` dans la
transaction de l'écriture, **client comme staff** : `company.member_invited`
(`via`, rôle), `company.member_invitation_accepted`,
`company.member_invitation_declined`, `company.member_invitation_revoked`,
`company.member_removed`. Le staff y gagne la trace qui manque aujourd'hui.
`lint:journal-tracked` est élargi aux handlers d'invitation.

## 6. Lot B — e-mails

`customer.colleague-invited` et `customer.colleague-invited-existing` nomment la
personne qui invite et la société, sans « l'équipe », sans promesse de retrait ;
inscrits au registre des textes d'e-mail. Les gabarits staff restent.

## 7. Lot C — fronts

- **Mon compte, contacts** : le lien selon `access`, pour owner/admin ; toast
  « invitation envoyée » ; refus affichés tels quels ; confirmation de
  suppression qui dit que l'accès est retiré.
- **Invitations reçues** : un bandeau dans l'app, « X vous invite à rejoindre
  Société » avec Accepter / Refuser.
- **Admin** : la fiche montre les invitations en attente et leur auteur.

## 8. Tests

Domaine (invitation : rôle owner impossible, expiration, auteur exclusif), handlers
à ports doublés (chaque refus de §5.1 dans l'ordre, les quatre cas de compte **avec
la même réponse**, limites, acceptation refusée sur adresse non prouvée, expirée,
société suspendue), e2e Postgres (mur tenant, course de deux invitations, compte
existant jamais rattaché avant acceptation, suppression qui retire l'accès mais
jamais le détenteur ni soi-même, changement d'adresse refusé), `lecteur-de-migrations`
sur la migration.

## 9. Ce que ce plan ne fait pas

- Pas de retrait d'accès sans supprimer le contact.
- Pas d'invitation à une adresse libre.
- Pas de migration des accès ouverts par le staff avant ce plan : ils restent.

## 10. Questions pour la seconde contradiction

1. L'acceptation d'office à la première connexion d'un compte créé par
   l'invitation est-elle sûre, sachant que le lien de mot de passe prouve la boîte ?
2. Les limites (10 min par contact, 20 par jour par société) : suffisantes contre
   l'usage abusif d'Auth0 et de Resend ?
3. Un admin peut-il retirer un autre admin en supprimant son contact ?
4. La table et l'index partiel tiennent-ils l'unicité sous course, et l'ancienne
   invitation staff (rattachement direct) doit-elle passer par le même modèle ?

## 11. Seconde contradiction (vitruve, 2026-09-14) — ce qui change

La v2 ci-dessus reste le socle ; ce qui suit **la corrige** et fait foi là où les
deux divergent.

### 11.1 Corrigé, sans décision nouvelle

| #   | Objection                                                                                                                   | Correction retenue                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | La réponse neutre fuit par sa **durée** : Auth0 + envoi, un envoi, ou rien                                                  | Le 202 part **à la fin de l'étape 1** (invitation + fait). La préparation du canal (§5.1 étape 2) tourne **hors requête**, abonnée au fait `company.member_invited`. Écrit : _la réponse ne dépend du compte ni par son contenu, ni par sa durée_                                                                                                                      |
| B2  | L'acceptation d'office accepte les invitations de **toutes** les sociétés, avec `SYSTEM_ACTOR`, hors porte, et sans reprise | **Seule l'invitation du lien** s'accepte d'office : son identifiant voyage dans l'URL de retour du lien de mot de passe. Un **handler** l'accepte après `attachIdentity`, acteur = la personne, dans une unité de travail qui passe **aussi** le compte à `active` — un échec laisse le compte `invited` et se retente. Toutes les autres : bandeau Accepter / Refuser |
| B3  | Limites lues puis écrites (course) ; `last_sent_at` écrasé ne compte pas les envois ; aucune limite par inviteur            | Délai par contact en **`UPDATE … WHERE last_sent_at < now - 10 min`** qui ne continue que si une ligne est touchée. Table append-only **`company_invitation_sends`** (une ligne par envoi) pour les plafonds : 20 envois/jour par société, 10 par inviteur. L'inviteur doit avoir une adresse **prouvée**                                                              |
| S5  | Adresse de connexion changée par le membre : la projection et la suppression perdent la trace                               | `company_invitations.accepted_by_user_id` : on retire **par identifiant**, jamais par adresse                                                                                                                                                                                                                                                                          |
| S6  | Accepter fait un `upsert` qui réécrit le rôle d'un membre existant                                                          | Acceptation = **création seule** ; rattachement déjà là → invitation marquée `accepted`, rôle **intact**                                                                                                                                                                                                                                                               |
| S7  | « `active` depuis les rattachements » passerait à actif tous les accès staff jamais utilisés                                | La règle actuelle de `projectContacts` (rattachement + `users.status`) **reste** ; les invitations s'ajoutent à côté. Test sur un accès staff en attente                                                                                                                                                                                                               |
| S9  | La suppression staff et le 409 d'adresse (carnet commun) ne sont pas décrits                                                | Écrit au Lot A : le refus de changer l'adresse d'un contact qui a un accès vaut pour le staff aussi ; la suppression staff suit la décision 11.2 a                                                                                                                                                                                                                     |
| m   | Upsert sur index partiel, `CHECK`                                                                                           | SQL brut : `INSERT … ON CONFLICT (company_id, email) WHERE status = 'pending' DO UPDATE` ; `CHECK` auteur exclusif et `role <> 'owner'` ; FK `invited_by_user_id` en `RESTRICT` (un compte ne se supprime pas physiquement)                                                                                                                                            |
| m   | Échéance                                                                                                                    | 14 jours depuis **`last_sent_at`** : un renvoi rouvre le délai, c'est ce qu'il promet                                                                                                                                                                                                                                                                                  |
| m   | Identité Auth0 existante, inconnue chez nous : « posez votre mot de passe » à qui en a un                                   | `provision` qui retrouve une identité → gabarit « connectez-vous pour accepter », pas de ticket                                                                                                                                                                                                                                                                        |
| m   | Invitation expirée, lien encore valide : compte actif sans rien                                                             | Écran d'arrivée qui dit « cette invitation a expiré, demandez à X de la renvoyer »                                                                                                                                                                                                                                                                                     |

### 11.2 À trancher par Hugo

**a. Qui une suppression de contact peut-elle couper ?** ✅ **Tranché par Hugo le 2026-09-14 : seulement les accès nés d'une invitation de la société.** Exemple posé : Léa, admin ouverte par le staff, garde son accès quand un autre admin ajoute puis supprime un contact à son adresse. La confirmation dit que l'accès ouvert par La Folie Douce reste ; aucun retrait ne laisse la société sans détenteur ni admin. Aujourd'hui n'importe

**b. Le staff passe-t-il aussi par l'invitation pour un compte déjà actif ?** ✅ **Tranché par Hugo le 2026-09-14 : oui, pour la seule branche « compte actif ».** Les adresses inconnues et `invited` gardent le chemin direct du staff.

## 12. Troisième contradiction (vitruve, 2026-09-14) — ce qui change encore

Fait foi sur le §11 là où ils divergent.

| #   | Objection                                                                                                                                                                                                                                                           | Correction                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | L'abonné au fait publié **dans** `uow.run` hérite du contexte de la transaction (`transaction.store.ts`, proxy `transactionalPrisma`) : après le premier `await` Auth0, ses écritures visent une transaction commitée, échouent, et `BackgroundWork` avale l'erreur | Le fait qui déclenche l'envoi est publié **après le retour** de `uow.run` ; `BackgroundWork.track` sort du contexte transactionnel (`storage.exit`). e2e où l'abonné écrit en base                                                                                                                                                                                              |
| B2  | Aucune garantie de livraison : bus en processus, sans outbox ni rejeu ; le §5.1 promettait « un envoi raté se voit »                                                                                                                                                | L'abonné écrit **l'issue de chaque envoi** dans `company_invitation_sends` (`sent` / `failed` + raison) ; l'écran admin la lit ; un envoi `failed` ne compte ni dans le délai ni dans les plafonds. **Pas de rejeu automatique**, écrit                                                                                                                                         |
| B3  | L'identifiant d'invitation dans l'URL n'est lié à aucun compte : un admin client ferait accepter sans clic une personne active ; et « le compte reste `invited` » est faux — le resolver le passe `active` dans le guard, avant tout handler                        | Colonne **`provisioned_user_id`**, écrite par l'abonné quand **il crée** le compte. Acceptation d'office admise **seulement** si `provisioned_user_id = principal.userId` **et** `invitation.email` = adresse prouvée du compte ; sinon bandeau et clic. La promesse « reste `invited` » est abandonnée : l'acceptation d'office est idempotente et rejouable depuis le bandeau |
| B4  | La décision 11.2 b casse trois appelants de `grant` : l'invitation de membre staff (relit un rattachement qui n'existe plus → 404), le rattachement du **détenteur** (`role: owner`, interdit en invitation), et le contrat servi `HolderOutcome = "attached"`      | `InviteCompanyMember` rend une vue sans membre quand la personne est invitée ; **l'issue `"invited"` s'ajoute** à côté de `"attached"` (déprécié, pas retiré). Le **détenteur** d'un compte actif : à trancher (§12.1). Les deux tests qui changent de sens sont nommés et réécrits                                                                                             |
| S   | `accepted_by_user_id` rempli sur un rattachement déjà ouvert par le staff ferait couper Léa (11.2 a)                                                                                                                                                                | Rempli **seulement si l'acceptation a créé** le rattachement                                                                                                                                                                                                                                                                                                                    |
| S   | Plafonds de `company_invitation_sends` : compter puis insérer laisse passer N requêtes                                                                                                                                                                              | `pg_advisory_xact_lock` sur la société avant le comptage, dans l'unité de travail                                                                                                                                                                                                                                                                                               |
| S   | « Jamais sans détenteur ni admin » : vide avec un détenteur, trouée sans lui (deux retraits concurrents)                                                                                                                                                            | Même verrou de société ; e2e à deux suppressions concurrentes                                                                                                                                                                                                                                                                                                                   |
| S   | Délai et création en deux instructions                                                                                                                                                                                                                              | Une seule : `INSERT … ON CONFLICT … DO UPDATE … WHERE last_sent_at < seuil RETURNING id` ; aucune ligne = 429                                                                                                                                                                                                                                                                   |
| m   | Supprimer puis réajouter le contact contourne le délai                                                                                                                                                                                                              | Accepté : les plafonds journaliers restent le frein ; écrit                                                                                                                                                                                                                                                                                                                     |
| m   | FK `accepted_by_user_id`                                                                                                                                                                                                                                            | `RESTRICT`, comme `invited_by_user_id`                                                                                                                                                                                                                                                                                                                                          |

### 12.1 À trancher par Hugo

**Le staff rattache le détenteur d'une société à une adresse qui a déjà un compte
actif** (création de compte ou « rattacher le détenteur »). Une invitation ne
peut pas porter `owner`. Soit ce cas garde le **rattachement direct**, staff
seulement — la décision 11.2 b s'arrête au détenteur ; soit l'invitation accepte
`owner` **pour le staff seulement**, et le détenteur doit accepter avant d'entrer.

### 12.2 L'état du plan

Trois contradictions, dix objections bloquantes au total, toutes nées du même
fait : aujourd'hui **inviter est rattacher**, et séparer les deux touche le bus
d'événements, le resolver d'identité, trois appelants staff et un contrat servi.
La construction est un chantier à lots (migration, domaine, API client, chemin
staff, e-mails, deux fronts), pas un lien sous un contact.

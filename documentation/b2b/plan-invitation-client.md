# Inviter un contact depuis Mon compte

> Écrit le 2026-09-14 à la demande de Hugo. **Soumis à `vitruve`** : il déplace
> une frontière de sécurité — un client ouvre l'accès à l'espace de sa société
> (`CLAUDE.md` §9 bis). Rien de ce qui suit n'est construit.

## 0. La demande

Dans Mon compte, sous chaque **contact** de la société (pas sous le détenteur),
un lien **« Envoyer une invitation »**. Aujourd'hui seul le staff ouvre un accès.

## 1. Ce qui existe (vérifié le 2026-09-14)

- **Staff seulement** : `POST /admin/companies/:companyId/members`
  (`admin-company-members.controller.ts`, `@AdminSurface("b2b_companies")`)
  → `InviteCompanyMemberCommand` → `InviteCompanyMemberHandler` →
  `AccountAccessGranter.grant` (`grant-account-access.service.ts`). La charge
  (`inviteCompanyMemberPayloadSchema`) porte une **adresse libre**, un nom et un
  rôle ; la route rend `CompanyMemberInvitedView { member, mailSent }`.
- **`grant` distingue trois cas** sur l'adresse normalisée (`EmailAddress`) :
  inconnue → identité provisionnée chez Auth0 + lien de mot de passe
  (`customer.access-opened`) ; connue `invited` → nouveau lien ; connue active →
  rattachement (`customer.company-attached`). Une adresse `disabled` est refusée
  (`AccountDisabledError`). `attach` écarte un second détenteur
  (`ensureNoRivalOwner`). Un e-mail qui ne part pas ne défait pas l'accès.
- **`invitedBy`** est documenté comme « le `sub` du staff — trace, pas
  autorisation », et écrit dans `users.invited_by` à la création.
- **Côté client, aucune route d'invitation.** Le bouton « Inviter » a été retiré
  de Mon compte faute de route (commit `3e4c6659`).
- **Les contacts client** : `POST/PATCH/DELETE /companies/:companyId/contacts[/:contactId]`
  (`company-contacts.controller.ts`), tous murés par `ensureCompanyAdmin` —
  `owner` ou `admin`, non-membre 404, autre rôle 403 (`company-access.ts`).
- **`ContactView`** (`packages/contracts/src/account.ts`) ne dit rien de l'accès
  d'un contact : ni `userId`, ni statut. La liste des membres
  (`CompanyMemberView`, avec `status`) n'est lue que par le staff.
- **Rôles** : `owner`, `admin`, `orders`, `billing` ; `assignableRoleSchema`
  exclut `owner`. Un contact peut avoir un rôle `null` (contact d'avant les rôles).

## 2. Décisions (Hugo, 2026-09-14)

| Sujet            | Décision                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qui invite       | **Détenteur et admin** — le mur des contacts (`ensureCompanyAdmin`), non-membre 404, autre rôle 403                                                                              |
| Quel rôle        | **Le rôle déjà posé sur le contact** ; jamais `owner`. Un admin peut inviter un admin. Rôle `null` → refus nommé : « précisez d'abord son rôle », comme l'écran staff            |
| Dossier en cours | **Autorisé** : une société non activée peut inviter ; l'invité voit le même état que le détenteur                                                                                |
| Déjà invité      | Le lien dit **« Envoyer une invitation »** (aucun accès), **« Renvoyer l'invitation »** (`invited`), **rien** (actif). Le client doit donc lire l'état d'accès de chaque contact |

## 3. La proposition

### 3.1 API

- **`POST /companies/:companyId/contacts/:contactId/invitation`** — **pas de
  corps**. La route ne reçoit ni adresse, ni nom, ni rôle : le handler les
  **relit sur le contact** de cette société. Un client n'invite donc que ce que
  son carnet de contacts porte déjà.
- `InviteMyCompanyContactCommand(actorUserId, companyId, contactId)` →
  handler : mur `ensureCompanyAdmin` → contact de CETTE société (sinon 404) →
  rôle non `null` et non `owner` (sinon 409 nommé) → `AccountAccessGranter.grant`
  avec `invitedBy` = l'identifiant du **client** → rend `{ status, mailSent }`
  (pas la vue membre du staff : e-mail et `userId` d'un tiers n'ont pas à
  redescendre).
- **Lecture de l'état d'accès** : `ContactView` gagne
  `access: "none" | "invited" | "active"` — calculé en joignant contacts et
  memberships de la société sur l'adresse normalisée. Additif, un front en ligne
  qui l'ignore ne casse pas.
- **Journal** : fait `company_member.invited_by_customer` (société, contact,
  rôle, issue, `mailSent`), dans la transaction du rattachement si `grant` en
  offre une, sinon après — à trancher à la construction, et à dire.
- **`invitedBy`** : JSDoc amendé — c'est l'auteur, staff ou client, et le
  journal dit lequel.

### 3.2 Front

- Sous chaque contact de la liste Utilisateurs (et dans son panneau de détail),
  le lien selon `access`, visible seulement à `owner`/`admin` (`canManageContacts`).
- Au clic : appel, puis toast qui dit la vérité — « invitation envoyée », ou
  « l'accès est ouvert mais l'e-mail n'est pas parti, réessayez » quand
  `mailSent` est faux. Refus du serveur affiché tel quel.
- Rôle manquant : le lien reste, le refus dit de préciser le rôle et le geste
  « Modifier » est à côté.

### 3.3 Tests

Handler (mur 4 rôles + non-membre, contact d'une autre société 404, rôle `null`
409, rôle `owner` 409, adresse `disabled`, les trois issues de `grant`,
`invitedBy` client), lecture `access` (les trois états, casse d'adresse), e2e
Postgres (mur tenant, rôle `orders` 403, invitation puis `access: invited`, ré-
invitation idempotente), front (lien par état et par rôle, toast `mailSent`).

## 4. Ce que ce plan ne fait pas

- Pas de retrait d'accès par le client.
- Pas d'invitation à une adresse libre : on invite un contact.
- Pas de changement de rôle d'un membre existant par ce geste — voir §5, point 3.

## 5. Questions ouvertes pour la contradiction

1. **Élévation de privilège par l'adresse.** Un admin peut modifier l'adresse
   d'un contact (`update-company-contact`), puis l'inviter : l'adresse n'est donc
   pas plus contrainte qu'une saisie libre. Suffit-il que le rôle, lui, reste
   borné (jamais `owner`) ?
2. **Rattachement d'une cliente active d'une AUTRE société** : `grant` la
   rattache sans son accord (`customer.company-attached`). Acceptable venant du
   staff ; l'est-ce venant d'un client ?
3. **`attach` aligne le rôle** d'un membre existant (« Rattache (ou aligne le
   rôle) ») : ré-inviter un contact dont le rôle a changé modifie les droits d'un
   membre actif. Voulu, ou faut-il refuser quand le membre existe déjà ?
4. **Abus d'envoi** : rien ne limite le nombre d'invitations d'un client. Le
   throttler global (60/min par IP) suffit-il pour un geste qui envoie des
   e-mails et crée des identités Auth0 ?
5. **Contenu des e-mails** : `customer.access-opened` a été écrit pour un accès
   ouvert par l'équipe — **non vérifié** qu'il reste juste quand c'est un
   collègue qui invite.

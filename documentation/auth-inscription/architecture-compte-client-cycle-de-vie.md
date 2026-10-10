# Compte client — de l'ouverture à l'accès

> **Le cycle de vie complet d'un compte client B2B** : comment il s'ouvre (par le
> client ou par le commercial), qui le détient, comment il s'active, et comment
> l'accès d'une personne naît, se prouve et se périme.
>
> Le fil : **une société et une personne sont deux choses**. Le dossier s'ouvre
> sans détenteur, le détenteur se rattache sans être encore entré, et l'entrée se
> constate — elle ne se déclare pas.
>
> Consolidé le **2026-08-12**. Remplace et **supprime** quatre documents :
> architecture-onboarding-provisioning-b2b.md, admin-commercial-comptes-clients.md,
> decision-discretion-recherche-personnes.md et
> todos/post-release-detention-et-acces.md — **aucun de ces quatre documents
> n'existe dans le dépôt** (constaté le 2026-09-06). Ils ont été annoncés et
> jamais écrits ; la phrase est gardée parce qu'elle dit ce qui manque.
>
> Prérequis lus : [`architecture-identite-auth-tenancy.md`](architecture-identite-auth-tenancy.md)
> (Auth0 authentifie, notre base autorise ; le mur `company_id`) et
> [`../b2b/comptes-client/architecture-activation-configuration-b2b.md`](../b2b/comptes-client/architecture-activation-configuration-b2b.md)
> (quelles pièces sont exigées — la config que le verdict d'activation consomme).
>
> **Statut : ✅ livré**, sauf §8 (gestes de fin de vie) et §9 (branchements prod,
> **aucun essai réel n'a encore eu lieu**).

---

## 0. Le vocabulaire, d'abord

Quatre mots qu'on confond vite, et dont la confusion a produit la moitié des bugs
de ce sujet :

| Mot               | Ce que c'est                                                      | Où ça vit                     |
| ----------------- | ----------------------------------------------------------------- | ----------------------------- |
| **Société**       | Le dossier client : identité légale, pièces, adresses, conditions | `companies`                   |
| **Détenteur**     | La personne **du** compte — celle qu'on rappelle et qui commande  | colonnes `contact_*` aplaties |
| **Interlocuteur** | Quelqu'un qu'on appelle, qui n'a pas forcément de clés            | `company_contacts`            |
| **Accès**         | Le droit d'entrer dans l'espace, pour **une** société             | `memberships` + `users`       |

Le détenteur **est** le contact principal : celui qu'on rappelle est celui qui
commande. Les séparer était une distinction de modèle sans réalité commerciale.

Et l'accès n'est **pas une catégorie de personnes** : c'est un **état** de
chacune. Le responsable réception qui prend les livraisons n'a aucune raison de
se connecter — `none` est le cas le plus fréquent et parfaitement légitime.

## 1. Deux portes, un seul dossier

```mermaid
flowchart TD
    subgraph A["Porte A — le client s'inscrit"]
      A1["Register Auth0<br/>connection lfc-b2b-customers"] --> A2["Déclare sa société<br/>« Mes entreprises »"]
      A2 --> A3["Société pending<br/>+ le créateur en est détenteur"]
    end

    subgraph B["Porte B — le commercial ouvre"]
      B1["POST /admin/companies<br/>enseigne seule suffit"] --> B2["Société pending<br/>détenteur FACULTATIF"]
      B2 -.->|"plus tard"| B3["POST …/holder<br/>rattache le détenteur"]
    end

    A3 --> V{"Dossier pending"}
    B2 --> V
    B3 --> V
    V -->|"ACTIVATION — geste commercial"| ACT["Société active"]
    ACT --> FULL["Prix + commandes"]
    V -.->|"en attendant"| CAT["Catalogue sans prix"]
```

Le **dossier** est la société ; les deux portes y mènent, et **la validation
n'appartient qu'au commercial**. Un e-mail ne s'auto-attribue jamais des
conditions négociées.

**Différence essentielle entre les deux portes** : par la porte A il y a un
créateur, donc un détenteur d'office. Par la porte B, il n'y a personne — le
staff n'est pas le client. La société naît donc **sans membership**, et c'est
légitime : le staff la voit par la lecture cross-tenant (`AdminCompanyReader`),
pas par « Mes entreprises ».

## 2. Ce qui s'ouvre avec quoi

> ⚠️ **Le diagramme ci-dessous affirme « pending : ni prix, ni commande ». C'est
> faux, et c'était faux avant le 2026-09-14** (vérifié ce jour-là) :
> `POST /orders` accepte une commande pour une société `pending`, réglée par
> carte — seul le règlement **au compte** exige une société `active`
> (`place-order.handler.ts`, `maySettleOnAccount`). Le handoff de l'app cliente
> le voulait ainsi : « la commande est possible pendant la vérification ». Ce qui
> ferme la commande aujourd'hui est un **flag global**, pas le statut : voir
> [`plan-inscription-pro-seule.md`](plan-inscription-pro-seule.md) §2. Une règle
> « un dossier `pending` ne commande pas » reste une décision à prendre (plan §8, Q6).

**Une enseigne. C'est tout.**

Le commercial a le client au téléphone et n'a souvent que le nom de la maison.
Tout le reste — raison sociale, forme juridique, SIRET, TVA, KBIS, adresses,
**et le détenteur** — se complète après. Ce qui bloquerait ici bloquerait une
saisie faite pendant l'appel, donc un compte qui ne serait jamais ouvert.

Le minimum est tenu par l'**agrégat** (`Company.declare` exige l'enseigne), pas
par la frontière HTTP. La charge `createCompanyPayload` n'exige plus rien : elle
l'a fait, et refusait alors une ouverture que le domaine autorisait.

```mermaid
stateDiagram-v2
    [*] --> pending : déclarée (porte A ou B)
    pending --> active : ACTIVATION, gate serveur satisfait
    active --> suspended : staff, ou retrait de vérification KBIS
    suspended --> active : réactivation (staff) / re-certification (auto)
    active --> terminated : fin de relation
    terminated --> [*]

    note right of pending
      Catalogue en lecture seule.
      Ni prix, ni commande.
    end note
    note right of suspended
      Réversible. La cause décide
      du geste : staff → bouton ;
      kbis_revoked → re-certifier.
    end note
    note right of terminated
      Définitif. On ne réactive pas,
      on rouvre une société.
    end note
```

## 3. Le parcours réel, côté admin

```mermaid
sequenceDiagram
    actor C as Commercial
    participant Fiche as Fiche client
    participant API as Backend
    participant Auth0
    participant Client

    C->>API: POST /admin/companies { enseigne }
    API-->>C: 201 { id, holder: "deferred" }
    Note over C: « Rattachez le détenteur<br/>dès que vous aurez son adresse. »

    C->>Fiche: complète identité, TVA, KBIS, adresses
    C->>API: POST /admin/companies/:id/holder { email }
    API->>Auth0: provision + ticket de mot de passe
    API->>Client: e-mail avec le lien
    API-->>C: 201 { mailSent }

    Client->>Auth0: pose son mot de passe
    Client->>API: première requête authentifiée
    Note over API: invited → active (constaté)

    C->>API: POST /admin/companies/:id/activate
    Note over API: le gate vérifie TOUT<br/>avant de laisser passer
    API-->>C: 204 — le client peut commander
```

**L'issue du rattachement a trois valeurs, pas deux** (`HolderOutcome`) :
`attached`, `deferred` (aucune adresse saisie — un **choix**), `failed` (le canal
d'identité n'a pas répondu — une **panne**). Les confondre faisait annoncer un
incident à qui venait simplement de remettre le rattachement à demain.

## 4. Le détenteur : trois gestes, et un seul par intention

| Intention                    | Geste                              | Écrit                       |
| ---------------------------- | ---------------------------------- | --------------------------- |
| **Désigner** la personne     | `POST /admin/companies/:id/holder` | contact **et** accès, en un |
| **Corriger** ses coordonnées | `PATCH …/primary-contact`          | le contact seul             |
| Ouvrir l'accès d'un collègue | `POST …/members`                   | l'accès seul                |

`changePrimaryContact` **refuse** de créer un détenteur (`CompanyHasNoHolderError`),
et `attachHolder` refuse d'en remplacer un (`CompanyAlreadyHasOwnerError`). Sans
ces deux refus, il existait deux chemins vers le même état — dont un en deux
temps où l'on pouvait s'arrêter au milieu, laissant un nom en fiche **sans la clé
de l'espace**.

**L'ordre du rattachement compte** : l'accès d'abord, la fiche ensuite. Un échec
du fournisseur d'identité ne laisse alors rien derrière lui, et la reprise
repasse (l'ouverture d'accès est idempotente sur l'adresse). Dans l'autre sens,
la seconde tentative se ferait refuser par l'agrégat, qui verrait la place prise.

## 5. On ne cherche pas les personnes

**L'adresse e-mail est la seule clé, et rien ne se cherche.** Aucune route ne
répond « cette adresse est-elle connue ? » — `GET /admin/customers?q=` et
`by-email` ont été supprimés.

Dans un circuit fermé, savoir **qui travaille avec qui** est une information
commerciale. Trois personnes ne doivent pas l'apprendre :

| Qui                | Ce qu'il ne doit pas apprendre                       |
| ------------------ | ---------------------------------------------------- |
| Le **détenteur A** | que son comptable travaille aussi chez B             |
| Le **commercial**  | que l'adresse qu'il saisit est déjà cliente ailleurs |
| Un tiers           | que telle adresse existe dans notre fichier          |

Le commercial est pourtant interne. On le tient quand même à l'écart : ce qu'il
ne sait pas, il ne peut ni le répéter en clientèle ni le laisser fuir. Et il n'en
a **pas besoin** — c'est l'intéressé qui apprend, par l'e-mail qu'il reçoit,
qu'une société a rejoint son espace.

```mermaid
flowchart LR
  saisie["Le commercial saisit<br/>une adresse"] --> serveur{{"Le serveur résout"}}
  serveur -->|inconnue| ouvre["identité + lien"]
  serveur -->|"connue, sans mot de passe"| relance["nouveau lien"]
  serveur -->|"cliente active"| rattache["société ajoutée<br/>à son espace"]
  ouvre --> ecran["« C'est envoyé à … »"]
  relance --> ecran
  rattache --> ecran
```

**Un seul libellé pour trois chemins** : c'est le cœur du dispositif. L'issue
(`AccessOutcome`) reste au serveur, où elle choisit seulement quel e-mail part.

C'est aussi le choix qui tient à l'échelle : la recherche par nom était un
`ILIKE %terme%` sur trois colonnes — un balayage de toute la table des personnes
à chaque frappe. La résolution par adresse est un accès par index.

**Ce que ça coûte, assumé.** La faute de frappe n'a plus de filet :
`jean@comptior.fr` crée une seconde personne et envoie un lien dans le vide. Le
garde-fou honnête serait de traiter les **rebonds d'e-mail** comme un signal —
ce que nous ne faisons pas encore, et qui est la contrepartie logique de cette
décision.

**Règles qui en découlent :**

1. **Le nom d'une personne lui appartient.** Nos e-mails s'adressent à elle avec
   **son** prénom, jamais celui qu'un commercial vient de taper.
2. **Aucune réponse d'API ne révèle l'existence d'une adresse.** Pas
   d'`attachedToExisting`, pas d'`outcome`, pas de compteur.
3. **Une exception se documente ici** — le jour où un annuaire interne ou une
   fusion de doublons en aura besoin.

## 6. L'activation : un seul verdict, celui du serveur

`activationGate(company, settings)` est **la seule autorité**. Il rend
`canActivate`, la liste des **empêchements** (des codes, pas des phrases) et
l'état pièce par pièce. L'écran ne rejoue rien : il donne un titre et un bouton.

```mermaid
flowchart LR
  gate["activationGate()"] --> blockers["blocking[]"]
  blockers --> ecran["Synthèse : une phrase par empêchement"]
  blockers --> bouton["« Activer » — allumé ssi vide"]
  gate --> porte["ActivateCompanyByStaff<br/>même verdict"]
```

Les empêchements : `identite_legale`, `detenteur`, `telephone`, `tva`,
`kbis_absent`, `kbis_non_verifie`, `facturation`, `livraison`. Les quatre
derniers dépendent de la config plateforme (`hidden` / `optional` / `required`) ;
les trois premiers ne se désactivent pas.

Deux d'entre eux méritent leur raison d'être :

- **`detenteur`** — un compte s'**ouvre** sans détenteur, il ne devient pas
  **client** sans. Activer sans personne à qui ouvrir l'espace fabriquerait un
  compte actif dont la porte est murée.
- **`telephone`** — un livreur qui cherche une porte doit pouvoir appeler
  quelqu'un. N'importe lequel des interlocuteurs, pas forcément le détenteur.

Cette règle a été écrite deux fois par le passé — une fois au serveur, une fois à
l'écran — et les deux ont dérivé : « Activer » s'allumait sur un KBIS déposé mais
non vérifié, et le serveur répondait 409. **Une règle écrite deux fois est une
règle qui finira par se contredire.**

La **traçabilité** est figée à l'acte : qui a activé, à quel titre, quand
(`activatedBy` : sub + nom + rôle, recopiés, jamais re-joints à l'affichage). Un
nom d'aujourd'hui ne vaut pas pour l'acte d'hier.

## 7. Le cycle de vie d'un accès

```mermaid
stateDiagram-v2
    [*] --> none : interlocuteur noté, aucune clé
    none --> invited : on lui ouvre l'accès
    invited --> active : PREMIÈRE REQUÊTE AUTHENTIFIÉE
    invited --> expired : 7 jours sans être réclamé
    expired --> invited : relance (nouveau lien)
    active --> [*]

    note right of active
      Constaté, jamais déclaré :
      le resolver le pose quand
      la personne arrive.
    end note
```

**L'entrée se constate — si l'invitation vit.** `invited → active` se fait
tout seul, à la première requête authentifiée (`customer-principal.resolver.ts`,
ou `unknown-subject-admission.ts` pour une entrée par code ou Google), et
seulement si au moins un rattachement l'accueille : accepté, ou invitation de
moins de 7 jours. Sinon, refus nommé (§8.1 bis, bâti le 2026-10-10).

**L'invitation périme au bout de 7 jours** (`INVITATION_LIFETIME_DAYS`), la
durée de vie du lien de mot de passe chez le fournisseur, dont elle est
**dérivée** depuis le 2026-09-18. Elle valait 14 jours avant, sur un lien qui en
vivait 7 : du 8ᵉ au 14ᵉ jour, l'écran annonçait un lien déjà mort.

Le compteur est le `invited_at` du **membership** (depuis le 2026-10-10 ;
`created_at` avant, qu'un lien remis ne renouvelait pas), pas celui du compte :
la même personne a pu être invitée ailleurs il y a un an et ici hier. Un lien
remis pour une société, ou un nouvel « ouvrir l'accès », le repose.

La règle (`isInvitationExpired`) est **pure et écrite une seule fois**, parce
qu'elle sert deux endroits : l'écran et l'**entrée**. À l'échéance, rien n'est
supprimé : l'entrée refuse, et **le contact reste en fiche** — le commercial
ne perd pas sa saisie, et « relancer » refait une demande neuve.

## 8. Ce qui reste à faire

Les trois manques se tiennent : ils portent tous sur la **fin** d'un accès, alors
que tout ce qui précède porte sur son ouverture.

### 8.1 Balayer les invitations périmées — _le plus proche_

La décision est prise, la règle est écrite, l'hôte existe : le **Cloudflare Cron
Trigger** qui appelle déjà `POST /admin/recompute` trois fois par jour, derrière
`RecomputeGuard`. Reste :

- une commande `ExpireStaleInvitationsCommand` qui supprime les **memberships**
  dont l'utilisateur est encore `invited` au-delà du délai ;
- **le membership seulement, pas le compte** : une personne invitée ailleurs ne
  doit pas perdre son identité parce qu'une société l'a oubliée. Un `user`
  `invited` sans membership est inoffensif, et une ré-invitation lui réémettra
  simplement un lien ;
- le compteur dans la réponse, pour que le cron laisse une trace lisible.

C'est le seul écart **déjà en production** entre ce que l'écran dit et ce que la
base contient.

### 8.1 bis — Le trou ouvert par la connexion par code, et la décision (2026-10-10)

> ✅ **Bâti le 2026-10-10**. Décidé
> par Hugo le 2026-10-10 : option (a), grâce de 7 jours, staff dans le même
> lot. Relu par `vitruve` avant de bâtir (frontière d'accès). Ce qui a été
> tranché en bâtissant, et ce qui reste, est en fin de section.

**Le constat** (relu le 2026-10-10, `customer-principal.resolver.ts`) :
`invitation-expiry.ts` affirme qu'« aucun balayage n'est nécessaire : le lien se
révoque tout seul chez Auth0 ». C'était vrai tant que le lien de mot de passe
était la seule porte. Depuis le 2026-10-09, la connexion par **code e-mail**
est ouverte sur la boutique, et Google aussi : une personne invitée dont
l'invitation a expiré peut se connecter sur la même adresse, et à sa
première requête `record()` la passe `invited → active` — elle entre dans la
société, des mois après. Le rattachement, lui, n'a jamais été retiré.

**La décision (a) — refuser à l'entrée, plutôt que (b) balayer la nuit** :
rien n'est supprimé, et le trou se ferme à la requête, pas au passage suivant.

**La conception v1 a été contredite par `vitruve` le 2026-10-10** (3 BLOQUANT,
5 SÉRIEUX). Ce qu'il a montré, et que la v2 reprend :

- **B1 — le trou ne passe pas par `record()`.** Une connexion par code ou par
  Google arrive avec un `sub` inconnu : `provision` → `admitted` →
  `UnknownSubjectAdmission.claim()`, dont l'`updateMany` passe la personne
  `active` (`unknown-subject-admission.ts:142-145`). La règle doit vivre DANS
  cette écriture conditionnée, et dans `record()` pour le chemin du lien.
- **B2 — le statut `invited` est porté par la PERSONNE, pas par le
  rattachement** (`Membership` n'a que `role`, `createdAt`, `updatedAt`). Une
  personne invitée par A (expirée) et B, qui entre par B, voit A s'ouvrir
  pour toujours : `findBySub` charge tous ses rattachements.
- **B3 — remplir la colonne avec `created_at` fermerait d'un coup** toutes
  les invitations de plus de 7 jours en production (43 comptes `invited`
  le 2026-10-09), alors que l'e-mail d'invitation propose d'entrer par code
  depuis ce jour-là.

**La conception v2 :**

1. **Le rattachement porte sa propre invitation** : `invited_at` (quand
   l'invitation a été émise ou renouvelée) et `accepted_at` (quand la
   personne est entrée par lui ; `null` = pas encore). Un rattachement
   **ouvre** la société s'il est accepté, ou si son invitation vit.
2. **L'entrée accepte les rattachements vivants**, dans la même écriture
   conditionnée : `claim()` (sub inconnu) et `record()` (lien) posent
   `accepted_at` sur les rattachements non acceptés dont l'invitation vit, et
   passent la personne `active` seulement s'il y en a au moins un. Sinon :
   refus.
3. **Le `Principal` ne porte que les rattachements qui ouvrent** (acceptés,
   ou invitation vivante) : une société dont l'invitation a expiré ne
   s'ouvre pas, même à une personne active ailleurs.
4. **Un lien neuf renouvelle UNE invitation** : celui que le commercial
   remet depuis la fiche d'une société repose `invited_at` de CE
   rattachement ; `attach` sur un rattachement existant aussi (aujourd'hui il
   ne fait que réécrire le rôle). `IssuePasswordLinkCommand` gagne la
   société.
5. **Les trois lecteurs de date** (`company-contacts.projection.ts`,
   `prisma-admin-company.reader.ts`, `prisma-pending-access.reader.ts`) lisent
   `invited_at` : l'écran ne contredit plus l'entrée.
6. **Le refus** est une erreur nommée (« Votre invitation a expiré. Demandez
   un nouvel accès à votre interlocuteur La Folie Coffee. »), un fait au
   journal (id local, jamais le `sub`) et une cloche au commercial — le seul
   qui peut faire le geste de sortie. La boutique doit afficher le message
   au lieu de relancer la connexion (à vérifier).
7. **La migration** : `accepted_at = created_at` pour les rattachements
   d'une personne déjà `active` (elle est entrée) ; pour ceux d'une personne
   `invited`, **`invited_at` = l'instant de la migration** — une **grâce de
   7 jours** (Hugo, 2026-10-10) : aucune invitation en cours n'est fermée
   par le déploiement, et celles qui ne seront pas acceptées d'ici là
   expireront normalement.
8. **Le staff, dans le même lot** (Hugo, 2026-10-10). Il a le même trou :
   une fiche `invited` dont le lien est mort entre encore par « mot de passe
   oublié » sur la connexion de base, ou par le rapprochement d'adresse
   vérifiée (`prisma-staff-access.resolver.ts:159-200`) ; `invitedAt` y est
   nullable et l'échéance ignorée quand il est nul (`staff-user.rows.ts:87`).
   Même règle : le résolveur staff ne passe `invited → active` que si
   l'invitation vit, sinon refus nommé (« Votre accès a expiré. Demandez à
   un administrateur de vous le rouvrir. »), fait au journal, cloche aux
   détenteurs de `staff_access:write`. Chaque lien émis
   (`open-staff-access.service.ts`, invitation ou réinitialisation) repose
   `invitedAt`. La migration pose `invited_at` = l'instant de la migration
   pour les fiches `invited` où il est nul — la même grâce.
9. Une fois la règle lue à l'entrée, retirer les colonnes rouvrirait le trou :
   **irréversible dans les faits**. Les JSDoc fausses
   (`invitation-expiry.ts:17`, `company-contacts.projection.ts:124-126`,
   `unknown-subject-admission.ts:67-70`) sont corrigées.

**Éprouvé par** : la suite e2e « invitation-expiry » de `lfd-api` — invitée
expirée par code (refusée, reste `invited`, `sub` non réécrit, fait et
cloche) ; par le lien (403) ; invitation vivante (entre, `accepted_at`
posé) ; « un lien remis pour B renouvelle B, pas A » ; « active par B, A
expirée ne s'ouvre pas » ; staff invité expiré refusé, et un lien neuf qui
le fait entrer. La grâce de la migration n'a pas d'e2e (la base de test part
vide) : elle se contrôle en production (`documentation/ops/runbook.md`).

**Tranché en bâtissant (2026-10-10)** :

- **Migration** `20261010140000_l_invitation_du_rattachement`. Une personne
  `active` SANS `auth0_sub` (l'invité de la commande sans compte) n'est jamais
  entrée : ses rattachements reçoivent la grâce au lieu d'être acceptés.
- **Refus** : `InvitationExpiredError` (`account.invitation.expired`) et
  `StaffInvitationExpiredError` (`staff.invitation.expired`), catégorie
  `AuthorizationError` → **403**. Faits `user.entry_refused_invitation_expired`
  et `staff_user.entry_refused_invitation_expired`. Cloches
  `account.invitation_expired` (audience `b2b_companies:write`, lien vers la
  fiche de la société) et `staff.invitation_expired` (`staff_access:write`),
  une par invitation (clé = date de la dernière invitation) ; le fait, lui,
  s'écrit à chaque tentative refusée.
- **Sur le chemin du code**, la réécriture du `sub` et l'activation sont
  défaites par la transaction quand aucun rattachement n'est accepté.
- **Une personne ACTIVE** (validé par Hugo le 2026-10-10) accepte aussi un rattachement neuf à sa première
  requête dans les 7 jours ; au-delà, il n'ouvre plus rien. L'écran lit l'état
  sur le rattachement : non accepté, `invited` puis `expired`, même pour une
  personne active ailleurs.
- **`POST /admin/access-pending/:userId/link`** prend `{ companyId? }` ; sans
  société (les deux écrans d'aujourd'hui), le serveur renouvelle la plus
  récente invitation non acceptée — celle que la file affiche désormais.
  Sans invitation à renouveler : 404 `account.invitation.not_found`.
- **Le mur n'est pas que dans le `Principal`** (trouvé en bâtissant, fermé
  le même jour). Une seule définition côté requête,
  `openingMembership(now)` (dans `b2b/shared`, même borne que `isInvitationAlive`), portée par les six gardes qui relisent
  le rattachement en base (`roleOf` de `prisma-membership.reader.ts`,
  `prisma-order-guard.reader.ts`, `prisma-unpaid-access.reader.ts`,
  `prisma-bank-account-guard.reader.ts`, `prisma-loyalty-conversion.gate.ts`,
  `prisma-alert-company.reader.ts`) et par `GET /me`
  (`prisma-account.reader.ts`). Les autres lecteurs de `memberships`
  (contacts de facturation, détenteur affiché sur un bon, fiche et file du
  staff, paniers d'abonnement, semis) ne décident d'aucun accès et ne la
  portent pas (relu le 2026-10-10).
- **L'invité de la commande sans compte** reçoit la grâce dans la migration
  (Hugo, 2026-10-10).
- **Le fait de refus** s'écrit à chaque tentative ; seule la cloche est
  dédoublonnée (Hugo, 2026-10-10).

**Reste** :

- **Staff `pending`** (jamais invité) : hors périmètre — il entre encore par
  le rapprochement d'une adresse vérifiée (Hugo, 2026-10-10).

- La boutique ne reconnaît pas `account.invitation.expired` : elle n'affiche
  pas le message et ne déconnecte pas (seul `identity.link_required` l'est).
- Les deux écrans du back-office n'envoient pas encore la société au lien.

### 8.2 Révoquer un accès depuis l'admin

Le cas qui arrivera **en premier** : le commercial se trompe d'adresse.
Aujourd'hui, l'accès ouvert par erreur ne se retire pas sans toucher la base.

Son piège propre : **révoquer l'accès n'est pas retirer le contact**. La personne
peut rester l'interlocutrice qu'on appelle sans pouvoir se connecter.

À décider :

1. **Que devient l'identité chez le fournisseur ?** Retirer le membership suffit
   à couper l'accès _à cette société_. Désactiver le compte Auth0 le pénaliserait
   **ailleurs** — s'il travaille avec un autre de nos clients, on vient de le
   sortir de chez lui. Recommandation forte : **on ne touche qu'au membership**.
2. **Le détenteur est-il révocable ?** Non — sinon on fabrique une société sans
   détenteur _après_ activation, l'état que le gate refuse. C'est le §8.3.
3. **Trace** : qui, quand, pourquoi.

Forme pressentie : `DELETE /admin/companies/:id/members/:userId`, refus si la
cible est le détenteur, inline confirm nommant **l'adresse** — pas « cette
personne ».

### 8.3 Transférer la détention

Le rôle `owner` est **constaté et définitif** ; `ensureNoRivalOwner` interdit d'en
poser un second — bonne règle, sans porte de sortie. Trois situations réelles,
qui n'appellent pas la même chose :

- **Passation** — le gérant part, son associée reprend. Les deux existent, la
  sortante peut confirmer. Cas nominal.
- **Vente du fonds** — la question n'est plus « qui détient l'espace » mais « est-ce
  toujours le même client » : historique, mandat SEPA, conditions négociées.
- **Décès / départ brutal** — personne ne confirme rien. Le staff agit sur pièce,
  et la trace de **qui a décidé** devient l'essentiel.

À trancher **avant** d'écrire une ligne :

1. L'ancien détenteur perd-il tout accès, ou devient-il `admin` ?
2. **Le mandat SEPA survit-il ?** Il est signé par une personne pour une société.
   Sur une vente, le maintenir revient à prélever quelqu'un qui n'a rien signé.
3. Les commandes suivent-elles ? Elles portent `placedByUserId` — l'historique ne
   se réécrit pas, mais la facturation vise la société. À vérifier.
4. **Vente = transfert, ou nouveau compte ?** Le plus honnête est souvent
   d'ouvrir une nouvelle société et de clore l'ancienne. Le transfert resterait
   réservé à la **passation**.

Forme pressentie : `TransferOwnershipCommand(companyId, newHolderEmail, reason, staffSub)`
où `reason` est une union fermée (`passation | vente | deces | erreur`) qui
**choisit** les effets ci-dessus — pas un commentaire libre.

### 8.4 Plus petit, mais dû

- **Rebonds d'e-mail** comme signal — la contrepartie assumée du §5.
- **Recherche et tri** sur la liste des comptes (référence `C-XXXXXX`, SIRET,
  raison sociale). La data-table le supporte, rien n'est câblé.
- **Notifier le client à l'activation** de son compte.

## 9. À vérifier avant la préprod — la chaîne n'a jamais tourné

> **Aucun parcours réel n'a été joué de bout en bout.** Ce qui suit n'est pas du
> code manquant : ce sont des branchements. Tant qu'ils ne sont pas faits, le
> rattachement d'un détenteur **échoue en production**.

| #   | À brancher                                | Sans quoi                                                     |
| --- | ----------------------------------------- | ------------------------------------------------------------- |
| 1   | **Audience staff Auth0**                  | `/admin/*` refuse **tout** — on n'atteint même pas l'écran    |
| 2   | **Application M2M**                       | `IdentityProviderUnavailableError` — le rattachement rend 500 |
| 3   | **Clé Resend + domaine vérifié**          | `mailSent: false` — le client ne reçoit **rien**              |
| 4   | **Action Auth0 `email`/`email_verified`** | la personne pose son mot de passe et reste `invited` à jamais |

Détails qui se paient cher si on les découvre tard :

- **L'app M2M a besoin de `create:user_tickets`**, en plus de `create:users`,
  `read:users`, `update:users`. C'est ce scope-là qui fabrique le lien de mot de
  passe, et c'est celui qu'on oublie.
- `AUTH_ADMIN_DEV_BYPASS` est **interdit en production** (le boot refuse de
  démarrer) : il n'y a pas de contournement, l'audience staff est obligatoire.
- La clé mailer est **optionnelle** dans la config : l'API démarre sans, et le
  seul symptôme est un `mailSent: false` que l'écran annonce honnêtement. Rien ne
  crie.
- En développement, un **fournisseur d'identité local** prend le relais quand le
  M2M est absent (`DevCustomerIdentity`, sujet déterministe `dev|adresse`). Il ne
  se monte **jamais** en production — là, Auth0 reste en place et refuse
  clairement plutôt que de fabriquer des identités fantômes chez un vrai client.

**Le seul essai qui vaut** : ouvrir un compte en prod, y rattacher une de vos
adresses, recevoir le lien, poser le mot de passe, et vérifier que la fiche passe
de « invité » à « accès actif ». Tant que ce parcours n'a pas été joué **une
fois**, la chaîne est théorique.

Un écran Ops « état des canaux » (identité : configurée / e-mail : pas de clé)
éviterait de le découvrir au premier client.

## 10. Décisions verrouillées

| Date       | Décision                                                                            |
| ---------- | ----------------------------------------------------------------------------------- |
| 2026-07-29 | Self-signup **autorisé** mais gaté : produit un dossier, pas un client              |
| 2026-07-29 | Activation `pending → active` **manuelle**, jamais automatique                      |
| 2026-07-29 | Compte non validé : **catalogue sans prix ni commande**                             |
| 2026-07-30 | Personne ≠ société : `memberships` 0..N, `Principal` **sans** `companyId`           |
| 2026-08-02 | `terminated` = fin de relation, distinct de `suspended` (réversible)                |
| 2026-08-03 | Création admin = société **sans propriétaire** ; `pending` toujours                 |
| 2026-08-11 | **On ne cherche pas les personnes** — l'adresse est la seule clé (§5)               |
| 2026-08-12 | Le **détenteur est facultatif** à l'ouverture, exigé à l'activation                 |
| 2026-08-12 | Une invitation non réclamée **périme à 14 jours** ; l'accès tombe, le contact reste |
| 2026-08-12 | L'invitation en cours **ne bloque pas** l'activation — elle se voit, c'est tout     |

## 11. Où est le code

| Quoi                  | Où                                                                   |
| --------------------- | -------------------------------------------------------------------- |
| Domaine + CQRS        | `apps/lfd-api/src/b2b/account/`                                      |
| Verdict d'activation  | `.../account/domain/services/activation-gate.ts`                     |
| Échéance d'invitation | `.../platform/shared/invitation/invitation-expiry.ts`                |
| Ouverture d'accès     | `.../account/application/services/grant-account-access.service.ts`   |
| Fiche staff           | `apps/lfd-backoffice-frontend/src/app/fiche-client/`                 |
| Cartes partagées      | `packages/b2b-ui/src/company/`                                       |
| Espace client         | `apps/lfc-ecommerce-frontend/src/app/account/` et `.../entreprises/` |

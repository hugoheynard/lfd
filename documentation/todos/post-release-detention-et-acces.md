# Post-release — détention d'un compte & révocation d'accès

> **Différé volontairement.** Trois gestes manquent au cycle de vie d'un compte
> client : **transférer la détention**, **révoquer un accès à la main**, et
> **balayer les invitations périmées**. Aucun ne bloque la mise en service ; tous
> deviendront nécessaires au premier vrai incident.
>
> Écrit le **2026-08-12**, à la suite du durcissement du rattachement de
> détenteur. Prérequis lus :
> [`../b2b/architecture-onboarding-provisioning-b2b.md`](../b2b/architecture-onboarding-provisioning-b2b.md)
> et [`../b2b/admin-commercial-comptes-clients.md`](../b2b/admin-commercial-comptes-clients.md).
>
> **Statut : 📐 rien n'est codé** — sauf la lecture de l'échéance (§3), déjà en
> place : la fiche affiche `expired`, mais **personne ne révoque encore**.

---

## 0. Ce qui existe aujourd'hui

| Geste                               | État                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- |
| Rattacher un détenteur              | ✅ `POST /admin/companies/:id/holder` — contact + accès, en un geste |
| Corriger ses coordonnées            | ✅ `changePrimaryContact` (refuse de **créer**)                      |
| Ouvrir l'accès d'un collègue        | ✅ `POST …/members`, idempotent sur l'adresse                        |
| Voir qu'une invitation a expiré     | ✅ `access: "expired"` sur la fiche (calculé, 14 jours)              |
| **Changer de détenteur**            | ❌ `CompanyAlreadyHasOwnerError` — aucun chemin                      |
| **Retirer un accès**                | ❌ aucun endpoint                                                    |
| **Révoquer les invitations mortes** | ❌ rien ne balaie                                                    |

Les trois manques se tiennent : ils portent tous sur la **fin** d'un accès, alors
que tout ce qui est construit porte sur son **ouverture**.

## 1. Transfert de détention

Le rôle `owner` est aujourd'hui **constaté et définitif** : celui dont l'adresse a
ouvert le compte. `ensureNoRivalOwner` interdit d'en poser un second, et c'est la
bonne règle — mais elle n'a pas de porte de sortie.

Trois situations réelles, qui n'appellent pas la même chose :

- **Passation** — le gérant part, son associée reprend. Les deux personnes
  existent, la sortante peut confirmer. C'est le cas nominal.
- **Vente du fonds** — la société change de mains. La question n'est plus « qui
  détient l'espace » mais « est-ce toujours le même client » : historique de
  commandes, mandat SEPA, conditions négociées, tout est à trancher.
- **Décès / départ brutal** — personne ne peut confirmer quoi que ce soit. Le
  staff agit sur pièce, et la trace de **qui a décidé** devient l'essentiel.

**Ce qu'il faut décider avant d'écrire une ligne :**

1. **L'ancien détenteur perd-il tout accès, ou devient-il `admin` ?** La passation
   dit plutôt « il reste, sans les clés » ; le décès dit « il sort ». Un défaut,
   et une case.
2. **Le mandat SEPA survit-il ?** Il est signé par une personne pour une société.
   Sur une vente, le maintenir revient à prélever quelqu'un qui n'a rien signé —
   à révoquer, sans doute, mais c'est une décision de risque, pas de code.
3. **Les commandes en cours suivent-elles ?** Elles portent `placedByUserId`. Une
   commande reste à qui l'a passée (l'historique ne se réécrit pas), mais la
   **facturation** vise la société — donc rien à faire, à vérifier.
4. **Vente = transfert, ou nouveau compte ?** Le plus honnête est souvent d'ouvrir
   une nouvelle société et de clore l'ancienne : deux entités juridiques, deux
   dossiers. Le transfert reste réservé à la **passation**.

**Forme pressentie** : `TransferOwnershipCommand(companyId, newHolderEmail, reason, staffSub)`
avec `reason` d'une union fermée (`passation | vente | deces | erreur`) — la
raison n'est pas un commentaire libre, elle **choisit** les effets ci-dessus.
Trace figée comme pour l'activation et la certification KBIS. Et une **inline
confirm** qui dit ce qui va tomber : c'est un geste qu'on ne défait pas.

## 2. Révocation d'un accès depuis l'admin

Le cas qui arrive **le premier**, et de loin : le commercial se trompe d'adresse.
Aujourd'hui, l'accès ouvert par erreur ne se retire pas — il faudrait toucher la
base.

Plus bénin en apparence que le transfert, mais il touche à la même mécanique, et
il porte son propre piège : **révoquer l'accès n'est pas retirer le contact**. La
personne peut rester l'interlocutrice qu'on appelle sans pouvoir se connecter —
c'est même le cas le plus fréquent (`access: "none"`).

**À décider :**

1. **Que devient l'identité chez le fournisseur ?** Retirer le membership suffit à
   couper l'accès _à cette société_. Désactiver le compte Auth0 est plus radical
   et le pénalise **ailleurs** — s'il travaille avec un autre de nos clients, on
   vient de le sortir de chez lui. Recommandation forte : **on ne touche qu'au
   membership**.
2. **Le détenteur est-il révocable ?** Non — sinon on fabrique une société sans
   détenteur _après_ activation, l'état que le gate refuse justement. Retirer le
   détenteur, c'est le §1.
3. **Trace ?** Oui, même exigence que le reste : qui, quand, pourquoi.

**Forme pressentie** : `DELETE /admin/companies/:id/members/:userId`, refus si la
cible est le détenteur (renvoyer vers le transfert), inline confirm nommant
l'adresse — pas « cette personne ».

## 3. Balayage des invitations périmées

Décidé le 2026-08-12 : au-delà de **14 jours**, une invitation non réclamée
**perd son accès** ; le contact, lui, reste en fiche (le commercial ne perd pas sa
saisie), et « relancer » refait une demande neuve.

**Fait** : la règle (`isInvitationExpired`, pure), et la **lecture** — la fiche
affiche `expired` sans attendre personne, pour ne pas mentir entre deux passages.

**Reste** : le balayage qui révoque pour de bon. Il a déjà son hôte — le
**Cloudflare Cron Trigger** qui appelle `POST /admin/recompute` trois fois par
jour, derrière `RecomputeGuard`. À écrire :

- une commande `ExpireStaleInvitationsCommand` qui supprime les **memberships**
  dont l'utilisateur est encore `invited` au-delà du délai ;
- **le membership seulement** — pas le compte : une personne invitée ailleurs ne
  doit pas perdre son identité parce qu'une société l'a oubliée. Un `user`
  `invited` sans aucun membership est inoffensif, et une future ré-invitation lui
  réémettra simplement un lien ;
- le compteur dans la réponse, pour que le cron laisse une trace lisible.

## 4. Ordre suggéré

1. **§3, le balayage** — la décision est prise, la règle est écrite, l'hôte
   existe. C'est une demi-journée, et ça ferme le seul écart _déjà en production_
   entre ce que l'écran dit et ce que la base contient.
2. **§2, la révocation** — le geste qui manquera en premier au support.
3. **§1, le transfert** — le plus lourd, et celui qui demande de vraies décisions
   produit (mandat, historique, vente ≠ passation). À ne pas commencer avant de
   les avoir tranchées par écrit.

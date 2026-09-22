# Plan — `/mon-profil`, la page de la personne

**Statut** : 📐 plan, **version 1 du 2026-09-22**. Le §3 (mot de passe) déplace
une **frontière de sécurité** → `vitruve` avant de bâtir cette partie-là.

> « je pense que mon profil mérite une page structurée plutôt qu'un dialog, ça
> nous permettra de mieux mettre en page » · « les 3 » — Hugo, 2026-09-22.

---

## 0. Pourquoi une page, et pas une meilleure mise en page

Ce n'est pas une question de place.

**Un dialogue dit « un geste rapide, puis tu retournes à ce que tu faisais ».**
Ce qui doit vivre là n'est pas un geste : c'est un **sujet** — qui je suis,
comment j'entre, et si j'ouvre un compte pro. L'emplacement d'un écran affirme
le modèle, et le modèle actuel est faux : `/mon-compte` est le dossier de la
**société**, et la **personne** n'a aucun écran à elle. C'est exactement le §1
de [`todos/todo-releve-version-deployee.md`](../todos/todo-releve-version-deployee.md)
— « Mon compte » répondait par un formulaire de SIRET à qui demandait son compte.

**La page règle aussi un bricolage.** Un dialogue de saisie porte un brouillon
qu'on **annule** ; un rattachement de connexion **agit tout de suite**. Les
mêler ferait croire qu'« Annuler » défait un rattachement — d'où le dialogue
empilé du lot C, qui contournait le problème au lieu de le supprimer. Sur une
page, chaque section porte son comportement sans mentir.

---

## 1. La page et ses quatre sections

`/mon-profil`, sous le shell client, derrière `authenticatedGuard`. **Aucune
garde de société** : c'est la page de la personne, elle existe pour tout le
monde.

| Section                   | Comportement            | D'où elle vient                     |
| ------------------------- | ----------------------- | ----------------------------------- |
| **Identité**              | brouillon + Enregistrer | le dialogue `ProfilePanel`, déplacé |
| **Méthodes de connexion** | agit tout de suite      | le lot C, sa coquille change        |
| **Mot de passe**          | agit tout de suite      | neuf (§3)                           |
| **Compte professionnel**  | agit tout de suite      | `DossierCard`, déplacée (§4)        |

🔴 **Le dialogue `ProfilePanel` disparaît.** Deux façons d'éditer la même chose,
ce sont deux vérités à tenir d'accord. Le menu du compte mène désormais à la
page. Idem pour le dialogue empilé des méthodes de connexion, qui redevient une
**section**.

⚠️ **On ne garde que ce qui marche.** La page est conçue pour accueillir
d'autres sujets, mais aucune section n'est dessinée « pour plus tard ».

---

## 2. Ce qui survit du lot C, et ce qui change

**Survit sans être touché** :
`apps/lfc-ecommerce-frontend/src/app/auth/identity-authorization.ts` (la seconde
instance `Auth0Client` à cache isolé, `prompt: 'login'`),
`apps/lfc-ecommerce-frontend/src/app/account/login-methods.service.ts`,
`apps/lfc-ecommerce-frontend/src/app/account/login-methods.ts` (issues, refus,
libellés), les clés de copie fr/en/it.

**Change** : le composant `login-methods-dialog` devient une **section de
page**. Sa logique ne bouge pas ; il perd son en-tête et son pied de dialogue.

---

## 3. Changer son mot de passe 🔴 frontière de sécurité

> **Version 3 du 2026-09-22.** La v1 posait quatre questions ouvertes ; la v2,
> écrite après une contradiction de `vitruve` (3 BLOQUANT, 6 SÉRIEUX), a été
> **perdue** — un agent a annulé un reformatage du fichier pendant qu'un autre
> travaillait dessus (§9). Cette version-ci décrit **ce qui est bâti**, relu
> dans le code, plutôt que de restaurer un brouillon.

**Ce qui existait** : `issuePasswordLink`, atteint par quatre chemins, **tous
staff**. Pas réutilisable : le lecteur de la file filtre `status: "invited"`
(« fabriquer un lien pour un compte déjà actif serait fabriquer de quoi le
réinitialiser sans que personne l'ait demandé »), et le handler staff rend
`{ url, expiresAt }` — précisément ce qu'on interdit de rendre.

### R1 — RETIRÉE

« N'émettre que vers une adresse déjà prouvée » aurait refusé **tout le monde**.
Mesure et raisonnement au **§8**.

### R2 — Un chemin à part

`POST /me/password-link`, **sans corps**, identité du `Principal`, **204 No
Content**. Commande, handler et méthode de port neufs
(`RequestPasswordResetCommand`, `sendPasswordResetLink`).

🔴 **Le lien ne sort jamais du serveur.** L'émission et l'envoi sont **fusionnés
dans le port** : c'est ce qui garantit qu'aucune couche au-dessus ne peut le
voir, le journaliser ou le rendre.

### R3 — Un fait neuf

`user.password_reset_requested`, phrase « a demandé à changer son mot de passe ».
**Pas** `user.password_link_issued`, dont la phrase dit « à lui remettre en
personne » — elle mentirait sur un envoi automatique demandé par le client.

⚠️ L'ordre du jumeau staff (identité → journal → courriel) ne se transpose pas :
émission et envoi étant fusionnés, c'est **le fait d'abord, l'envoi ensuite**. La
règle réelle est préservée — « jamais un e-mail derrière un `500` » — et le fait
nomme la **demande**, qui a bien eu lieu.

### R4 — Refuser un compte sans mot de passe, plutôt qu'un 500

`issuePasswordLink` ne filtre **pas** la connexion : sur un compte entré par
Google, Auth0 refuse et la chaîne rendait un **500 « panne du fournisseur »**.
On lit donc les méthodes de connexion avant d'émettre, et l'absence d'identité
sur la connexion base de données est un refus nommé — `NoPasswordLoginMethodError`
(`identity.no_password_login`, 409), sans aucun identifiant dans son message.

⚠️ C'est un appel réseau sortant de plus, assumé, et qui n'a lieu que sur ce
geste.

### R5 — Un débit par COMPTE : **3 par heure**

Le seul limiteur du dépôt clé sur l'**IP**. Il en fallait un second, clé sur
`principal.userId`, réutilisant le stockage existant.

Ce que coûte l'absence est au §0 du CLAUDE.md : une adresse noyée part en rebond
dur, entre en liste de suppression chez Resend, n'en sort **qu'à la main**, et le
compte devient injoignable pour **tous** les autres courriels.

⚠️ **Une limite en mémoire est par instance** : à plusieurs conteneurs, le quota
réel est un multiple. Dit dans le JSDoc du garde ; décision d'exploitation à
confirmer.

### R6 — Un TTL à nous : **une heure**

Les sept jours de `PASSWORD_TICKET_TTL_SECONDS` sont ceux d'une **invitation** —
quelqu'un qui n'a rien demandé et lira peut-être la semaine suivante. Ici la
personne est devant son écran.

La durée est **passée** au fournisseur, jamais lue par lui, pour que les deux ne
dérivent pas : baisser celle des invitations casserait les congés, monter
celle-ci rouvrirait la fenêtre. Le corps du courriel la **dérive** de la
constante, pour qu'il ne puisse pas mentir.

### R7 — Notre gabarit, notre mailer (Hugo, 2026-09-22)

`customer.password-reset`. ⚠️ Deux JSDoc affirmaient qu'il n'existe que « le
seul » puis « le second » endroit où un lien de mot de passe apparaît : ils
étaient **trois** avant ce lot, quatre après. Corrigés.

### R8 — Ce qu'on ne sait pas, et qu'on n'affirme donc pas

Trois comportements d'Auth0 ne sont vérifiés nulle part : un ticket invalide-t-il
le mot de passe courant avant d'être suivi ; révoque-t-il les sessions ; que
rend-il sur une identité sociale (R4 fait qu'on n'y va jamais).

**Aucun texte — courriel ou écran — ne dit ce qu'il advient du mot de passe
actuel ni des sessions.** On dit ce qu'on sait : un lien est parti, il expire.

🔴 **Sauf un, antérieur** : `staff.password-reset` affirme toujours « votre mot
de passe actuel reste valable ». Non vérifiée, **déjà partie chez des humains**,
et volontairement non recopiée. Elle se tranche pour les deux surfaces à la fois.

### Ce qui n'est pas jouable en local

`DevCustomerIdentity.listLoginMethods` rend `connection: null` : sans M2M, le
refus R4 tombe **toujours**. Le geste ne s'éprouve donc pas par ce chemin.

---

## 4. Ouvrir un compte pro, depuis le profil

**Aujourd'hui** : `/mon-compte` sans société affiche `DossierCard` — la
déclaration d'établissement. C'est le défaut du §1 du relevé : un particulier
qui clique « Mon compte » reçoit un formulaire de SIRET.

**Après** : la carte devient une **section du profil**, où c'est un **choix**.

Les trois questions que le relevé laissait ouvertes, tranchées :

1. **`/mon-compte` en perso sans société** → redirige vers `/mon-profil`, au
   lieu de servir la porte pro. Une adresse servie reste servie ; elle change
   seulement de destination.
2. **L'entrée de menu « Mon compte »** disparaît pour qui n'a **aucune**
   société. Aujourd'hui elle ne disparaît que pour qui en a une et a basculé en
   perso (`companyScreensClosed` : `isPersonal() && hasChoice()`) — la
   condition est incomplète, pas fausse.
3. **L'atterrissage du retour d'Auth0 pro** → `/mon-profil`. ⚠️ Sans risque :
   `ProOnboarding` est injecté par le **shell**, pas par l'écran, donc la
   déclaration part quel que soit l'écran d'arrivée (vérifié le 2026-09-22,
   son JSDoc le dit : « Point d'injection prévu : le shell client, pour son
   EFFET et non pour son API »).

---

## 5. Les lots

| Lot    | Contenu                                                                                             | Bâtissable                                                                               |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **P1** | La page, sa route, l'entrée de menu ; Identité + Méthodes de connexion ; les deux dialogues retirés | **tout de suite** — réorganisation d'un comportement existant, aucune frontière déplacée |
| **P2** | Le mot de passe (§3), API + section                                                                 | **après `vitruve`**                                                                      |
| **P3** | Le compte pro (§4), section + les trois bascules                                                    | après P1                                                                                 |

**Tests** : un spec par composant neuf ; la page se teste par sections ; un e2e
pour `POST /me/password-link` quand il existera.

---

## 7. L'adresse appartient à la méthode de connexion (Hugo, 2026-09-22)

> « tu peux ajouter pour la méthode de connexion email changer l'email, changer
> le mot de passe ? »

### 7.1 Ce que la demande révèle

L'adresse e-mail était dans **Identité**, avec le prénom, le nom et le
téléphone. Or le dépôt dit partout qu'elle est autre chose :

> « L'adresse est aussi **l'identifiant de connexion** » — `ProfilePanel`
> « Auth0 **authentifie avec cette adresse** » — `CustomerIdentityPort`

Un prénom se corrige ; une adresse de connexion se **change**, et ce geste part
chez Auth0 avant d'être écrit chez nous. Les ranger ensemble faisait passer
pour une coordonnée ce qui est une **clé d'accès**.

**Décision** : l'adresse quitte Identité et devient l'action de la méthode de
connexion « E-mail ». Identité garde prénom, nom, téléphone.

🔴 **Elle n'est pas dupliquée.** Deux endroits pour changer la même chose, ce
sont deux vérités à tenir d'accord — c'est déjà la raison pour laquelle le
dialogue du profil a disparu (§1).

**Effet secondaire qui compte** : l'avertissement « ce qu'un changement
d'adresse emporte » s'affiche désormais **là où il se comprend** — à côté de la
connexion qu'il modifie, et non sous un formulaire de coordonnées.

### 7.2 « Changer mon mot de passe » attend encore, et voici quoi

C'est le §3, et il **reste bloqué** sur trois comportements d'Auth0 que rien
dans le dépôt n'atteste (§3, R8) :

1. un ticket de changement invalide-t-il le mot de passe courant **avant**
   d'être suivi ?
2. révoque-t-il les sessions en cours ?
3. que rend-il sur une identité **sociale** (qui n'a pas de mot de passe) ?

⚠️ La première a déjà une réponse **partie chez des humains**, dans un de nos
courriels — « votre mot de passe actuel reste valable » — que personne n'a
vérifiée. Elle se tranche une fois pour les deux surfaces.

**Ce qui ne bloque pas** : l'emplacement. Le geste ira sur la même méthode
« E-mail », sous le changement d'adresse. Poser le bouton avant d'avoir les
réponses reviendrait à livrer un geste dont on ne sait pas ce qu'il fait au
compte de quelqu'un.

---

## 8. R1 est RETIRÉE (2026-09-22) — une règle qui refusait tout le monde

> « il faut tenir compte du fait qu'on a aussi des clients **public**, cette
> option doit donc exister » — Hugo, 2026-09-22.

### 8.1 Ce que la mesure a dit

```
email_verified | comptes
---------------+---------
 f             |       5      ← aucun compte vérifié (base de dev, 2026-09-22)
```

Et `Auth0IdentityGateway.createUser` pose `email_verified: false,
verify_email: false` à l'ouverture d'une identité.

**R1 — « on n'émet le lien que vers une adresse déjà prouvée » — aurait donc
refusé tout le monde.** Sur le papier elle fermait proprement la chaîne de prise
de compte ; en pratique elle supprimait la fonctionnalité. Et la boutique sert
surtout des **particuliers**, pour qui ce bouton est le seul recours quand le
mot de passe est oublié.

🔴 **Pire que refuser : envoyer vers un mur.** Son geste de sortie était
« vérifiez d'abord votre adresse » — or **aucune route client ne permet de
demander un courriel de vérification**. La règle orientait vers une porte qui
n'existe pas.

**Retirée.** R4 (refuser un compte sans identité à mot de passe) reste : il est
indépendant, et il est juste.

### 8.2 La faute de raisonnement, pour qu'elle ne se refasse pas

`vitruve` l'avait dit et je l'ai mal appliqué : **le geste pivot n'est pas
l'envoi du lien, c'est le changement d'adresse.** J'ai protégé la
**conséquence** au lieu de la **cause**, ce qui donne la pire combinaison — une
règle qui gêne tout le monde et ne ferme pas ce qu'elle visait.

La protection va donc au **changement d'adresse** : l'exiger avec une
ré-authentification fraîche casse la chaîne à sa première étape, et laisse le
mot de passe ouvert à tous les clients sans condition. La mécanique existe déjà
— la seconde instance du SDK et `IdTokenVerifier`, bâtis pour le rattachement.

⏳ **Non bâti à ce jour**, et c'est un trou connu : tant qu'il n'est pas là, le
scénario du poste laissé ouvert reste possible. À traiter dès que les lots en
cours ont atterri.

### 8.3 Qui envoie le courriel : **nous** (Hugo, 2026-09-22)

Ce que le code prouve, et qui répond à « Auth0 ne le fait pas
automatiquement ? » :

- **le lien de mot de passe — non.** `POST /api/v2/tickets/password-change`
  **rend une URL**, rien de plus. C'est pourquoi le geste staff l'envoie
  lui-même ;
- **la vérification d'adresse — oui, et on la déclenche déjà.** `changeEmail`
  passe `verify_email: true`, donc Auth0 envoie son courriel à chaque
  changement d'adresse. C'est aussi pourquoi personne n'est vérifié : les
  comptes existants n'ont jamais changé d'adresse.

Décision : **notre gabarit, notre mailer**, cohérent avec le reste de la
boutique et calqué sur le geste staff, qui est éprouvé.

⚠️ Contrepartie assumée : un **troisième** endroit où un lien de mot de passe
apparaît dans un courriel — les deux JSDoc de `mail-templates.ts` qui affirment
qu'il n'y en a que deux doivent être corrigés dans le même lot (CLAUDE.md §8).

⚠️ Écarté sans être vérifié : le second chemin d'Auth0 (« mot de passe
oublié »), où Auth0 enverrait lui-même. Il n'a **pas** été éprouvé contre le
tenant — on ne l'a pas retenu, donc on ne l'affirme pas.

---

## 9. Deux agents, un fichier, une version perdue (2026-09-22)

La **version 2** du §3 — écrite après la contradiction de `vitruve`, avec le
sort de ses neuf objections — a été **détruite** avant d'avoir servi.

**Ce qui s'est passé**, dans l'ordre :

1. j'écris la v2 du §3, puis un §6 qui tient le sort des objections ;
2. un agent qui travaille sur le front trouve ce fichier signalé par
   `prettier --check`, **annule le reformatage** pour ne garder que sa propre
   correction — et remet du même coup le §3 dans sa version 1 ;
3. l'agent qui bâtit la route lit le document, n'y trouve **ni R1→R8 ni §6**,
   et le dit : « le lot livré n'est adossé à aucun texte ».

Sans son signalement, le code aurait vécu sur un document qui décrit autre
chose — la pire forme de doc périmée, parce qu'elle a l'air à jour.

🔴 **La règle que j'ai enfreinte est déjà écrite** : un seul consommateur d'une
ressource partagée à la fois, **moi compris**. J'ai édité ce plan pendant que
deux agents travaillaient dans le même arbre, en croyant qu'un fichier de
documentation ne les concernait pas. Il les concernait : l'un l'a lu, l'autre
l'a réécrit.

**Ce qu'on en retient**, et ce n'est pas « mieux se coordonner » :

- un agent qui **annule** une modification qu'il n'a pas faite détruit du
  travail concurrent sans le savoir — c'est silencieux, et rien ne rougit ;
- le seul garde-fou qui a joué est un agent qui a **comparé sa consigne au
  document** au lieu de la suivre. C'est pour ça qu'on leur demande de signaler
  ce qui ne tient pas dans le plan ;
- ce qui est réécrit ici décrit **ce qui est bâti**, relu dans le code — pas le
  brouillon perdu. Restaurer de mémoire aurait produit une troisième version,
  fausse autrement.

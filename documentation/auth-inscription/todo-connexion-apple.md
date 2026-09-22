# TODO — ajouter Apple aux méthodes de connexion

> Posé le **2026-09-22**, à la question de Hugo : « si je voulais ajouter apple
> en connexion rapide, via auth0 ? »
>
> Google est bâti et rattachable depuis `/mon-profil`
> ([`plan-rattachement-depuis-le-profil.md`](plan-rattachement-depuis-le-profil.md)) ;
> Facebook est **reporté**, faute d'avoir confirmé la connexion dans le tenant.

---

## 1. Le code : une entrée de liste, pas un chantier

**La mécanique est paramétrée par la connexion de bout en bout** — la seconde
instance du SDK, le vérificateur de jeton, le rattachement chez Auth0, les
refus. C'est la règle écrite dans `Auth0IdentityGateway` (« la connexion est un
paramètre […] en faire un paramètre plutôt que deux classes jumelles garantit
qu'une correction faite pour l'un profite à l'autre »), et l'écran a été
dessiné sur une **liste** de fournisseurs pour cette raison exacte.

Il reste donc :

- une constante `APPLE_CONNECTION` dans `auth.config.ts`, à côté de Google et
  Facebook ;
- une entrée dans la liste des fournisseurs proposables ;
- un libellé dans les trois langues (`account.{fr,en,it}.ts`).

⚠️ **Si l'un de ces trois points demande plus qu'une ligne, c'est que quelque
chose a été écrit « pour Google » quelque part** — c'est alors ça qu'il faut
corriger, pas contourner.

---

## 2. Le vrai travail est hors du dépôt, et il est plus lourd que Google

| Où            | Quoi                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| **Auth0**     | activer la connexion Apple sur l'application **cliente** (pas l'admin)        |
| **Apple**     | un compte développeur (payant), un **Service ID** et une **clé de signature** |
| 🔴 **Resend** | **déclarer notre domaine d'envoi** dans le service de relais privé d'Apple    |

### 🔴 Le piège est le relais privé

Apple donne souvent une **adresse masquée** (`…@privaterelay.appleid.com`).
Sans déclaration du domaine d'envoi côté Apple, nos courriels vers ces adresses
**rebondissent**.

Ce que coûte un rebond est au §0 du `CLAUDE.md` : une adresse en rebond dur
entre en **liste de suppression** chez Resend, et n'en sort **qu'à la main**.
Le compte devient alors injoignable pour **tout le reste** — confirmation de
commande, QR de retrait, lien de mot de passe.

⚠️ **Ça croise directement**
[`../order/todo-adresse-de-la-commande.md`](../order/todo-adresse-de-la-commande.md) :
une adresse masquée est précisément le cas où la commande doit porter **sa
propre** adresse de contact, demandée au panier. Faire Apple sans ce TODO-là,
c'est ajouter une porte d'entrée dont les clients ne recevront rien.

---

## 3. Une raison de le faire même sans envie

Si l'app cliente part un jour sur l'**App Store**, Apple exige « Se connecter
avec Apple » **dès qu'on propose Google ou Facebook** (règle 4.8, telle que
connue au 2026-09-17 — ⚠️ à revérifier avant de s'y fier, cette règle bouge).

Autrement dit : le jour où la coque native est soumise, Apple cesse d'être un
choix. Mieux vaut que ce ne soit pas une découverte de dernière minute.

---

## 4. L'ordre qui évite le travail inutile

1. **L'adresse de la commande** (l'autre TODO) — sinon on ouvre une porte dont
   les clients ne recevront pas leurs courriels ;
2. **les gestes de console** du §2, Apple compris, **avant** le code : c'est ce
   qui a fait reporter Facebook — un bouton dont la connexion n'est pas activée
   répond « connection not found », et on ne le sait qu'à l'écran ;
3. **les trois lignes** du §1, puis l'éprouver sur un vrai compte Apple, avec
   une adresse masquée, et vérifier **qu'un courriel arrive**.

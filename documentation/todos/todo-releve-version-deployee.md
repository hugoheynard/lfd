# Relevé de la version déployée — ce qui ne va pas

> Ouvert le **2026-09-22**, en parcourant la boutique en production avec un
> compte **PERSONNEL** (aucune société). C'est une liste qui GRANDIT : chaque
> entrée dit ce qu'on voit, ce qui le produit dans le code, et ce qu'on veut à
> la place. Rien n'y est tranché en conception — un point qui part en chantier
> prend son propre plan et se réduit ici à un renvoi.

---

## 1. « Mon compte » ouvre une ouverture de compte pro qu'on n'a pas demandée

**Ce qu'on voit.** Connecté sur un compte perso, le menu propose « Mon compte ».
L'écran ne montre pas un compte : il montre le **premier pas d'une déclaration
d'établissement** — SIRET, raison sociale — alors que rien n'a été demandé.

**Ce qui le produit.** Trois pièces qui, séparément, font ce qu'on leur a dit :

- [`client-nav.service.ts`](../../apps/lfc-ecommerce-frontend/src/app/client/nav/client-nav.service.ts) (l. 84)
  marque la destination `account` en `companyOnly`, mais le filtre
  (`companyScreensClosed`) ne la retire que si `isPersonal() && hasChoice()` —
  c'est-à-dire **pour qui a une société** et a basculé en perso. Sans aucune
  société, `hasChoice()` est faux : l'entrée reste au menu.
- [`client-workspace.guard.ts`](../../apps/lfc-ecommerce-frontend/src/app/client/client-workspace.guard.ts) (l. 45)
  laisse l'adresse ouverte pour la même raison, et l'écrit explicitement :
  « Sans aucune société, `/mon-compte` reste ouvert : c'est là que revient la
  porte pro ».
- [`compte-page.ts`](../../apps/lfc-ecommerce-frontend/src/app/client/mon-compte/compte-page/compte-page.ts)
  rend alors l'état `incomplete`, soit la seule `DossierCard` — « Compléter mon
  dossier ».

**Pourquoi c'est faux.** `/mon-compte` a été construite comme **le dossier de la
SOCIÉTÉ** (son JSDoc le dit, et « Mes informations » en est sortie le
2026-09-14 pour cette raison). Elle a ensuite été réquisitionnée comme **point
d'atterrissage du retour d'Auth0** pour l'inscription pro — un besoin réel, qui
a eu pour effet de faire de l'adresse la porte pro par défaut de qui n'a pas de
société. Un particulier qui clique sur « Mon compte » ne demande pas à devenir
client pro ; il demande son compte, et on lui répond par un formulaire de SIRET.

**Ce qu'on veut à la place** (Hugo, 2026-09-22) — le compte de la PERSONNE vit
dans **Mon profil**, et y gagne trois choses :

1. **Ouvrir un compte pro** — le geste devient un choix, pris depuis le profil,
   et non l'écran qu'on reçoit sans l'avoir demandé.
2. **Ajouter une autre méthode d'authentification** — n'existe nulle part :
   aucune route ne lie une identité Auth0 supplémentaire à un compte.
3. **Changer mon mot de passe** — le mécanisme EXISTE côté serveur
   (`issuePasswordLink`, `platform/identity/`), mais il n'est exposé qu'au
   **staff**, par `admin-access-pending.controller.ts`. Le client ne peut pas le
   déclencher pour lui-même.

**⚠️ Ce qui n'est pas encore tranché**, et qu'un plan devra dire avant toute
ligne :

- `/mon-compte` reste-t-elle l'atterrissage du retour d'Auth0 pro ? Si oui, elle
  garde son cas `incomplete` **pour ce seul retour** (déclaration en vol), et
  cesse d'être une porte ouverte à qui passe par le menu ;
- que devient l'entrée de menu « Mon compte » en perso — retirée, ou renommée ;
- « ajouter une méthode d'authentification » est un chantier **Auth0** (liaison
  de comptes) avec une frontière de sécurité : `vitruve` sera obligatoire sur
  son plan, au même titre que pour le changement de mot de passe côté client.

**Suite donnée le 2026-09-22** (Hugo : « on va commencer par le mon profil
dialog ») :

- les **méthodes de connexion** ont leur plan —
  [`auth-inscription/plan-rattachement-depuis-le-profil.md`](../auth-inscription/plan-rattachement-depuis-le-profil.md) ;
- le **changement de mot de passe** était déjà noté dans
  [`auth-inscription/todo-profil-client-auth0.md`](../auth-inscription/todo-profil-client-auth0.md)
  — avec sa contrainte : ne jamais afficher le ticket, qui marquerait prouvée
  une adresse que personne n'a vérifiée ;
- l'**ouverture de compte pro depuis le profil** n'a pas encore de plan.

---

## 2. Un commentaire nomme une adresse Cloudflare qui n'est plus servie

[`auth.providers.ts`](../../apps/lfc-ecommerce-frontend/src/app/auth/auth.providers.ts)
dit que « la même build sert localhost:7316, **lfc-b2b-eu7.pages.dev** et
lafoliecoffee.info ». C'était vrai jusqu'au 2026-09-22 : la boutique est passée
sur `lfc-ecommerce.pages.dev`, et `lfc-b2b-eu7` est le projet VIDE créé par
accident.

Mineur, et sans effet à l'exécution — `redirect_uri` est calculée, pas écrite.
Mais c'est exactement la forme de commentaire que le CLAUDE.md §8 vise : une
affirmation sur **ailleurs**, qui survit à ce qui la rendait vraie et enverra
chercher une adresse morte.

✅ **Corrigé le 2026-09-22**, dans le commit qui aligne la session de la
boutique (§3) — le JSDoc était réécrit de toute façon.

---

## 3. La boutique n'avait pas de jeton de rafraîchissement, le back-office si

**Ce qu'on voit** — rien, et c'est le sujet : un client sur iPhone est
déconnecté **en silence** au bout de sept jours, sans qu'aucune erreur ne soit
levée nulle part.

**Ce qui le produit.** `provideAuth0` de la boutique ne déclarait ni
`useRefreshTokens` ni `cacheLocation`. La mémoire de la session n'était donc pas
chez nous : chaque amorçage (`checkSession`) et chaque `getAccessTokenSilently()`
repartaient en iframe interroger le **cookie du tenant** — que Safari efface au
bout de sept jours (ITP).

🔴 **Le back-office les portait déjà**, avec sa raison écrite : « pour que la
session survive à un rechargement sans repasser par une iframe `checkSession`
que les navigateurs bloquent désormais ». La décision était donc prise,
argumentée et appliquée **sur une seule des deux apps**. Ce n'était pas un
arbitrage restant à faire, c'était un alignement manquant.

**Trouvé par la bande** : en cherchant pourquoi le rattachement Google depuis le
profil serait dangereux (plan
[`auth-inscription/plan-rattachement-depuis-le-profil.md`](../auth-inscription/plan-rattachement-depuis-le-profil.md)
§8.1, bloquant B-1 de `vitruve`). Le rattachement ne créait pas la fragilité, il
la rendait visible.

✅ **Aligné le 2026-09-22.** Tests 984/984, code de sortie 0, build AOT vert,
aucun dépassement de budget.

⚠️ **Reste un geste de console, à toi** : la boutique et le back-office sont
**deux applications Auth0 distinctes**, et la rotation des jetons de
rafraîchissement se règle par application. À vérifier sur celle de la boutique —
sans elle, on vient de poser une mémoire qui n'expire pas.

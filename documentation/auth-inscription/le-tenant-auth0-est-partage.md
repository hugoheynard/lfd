# 🔴 Le tenant Auth0 est PARTAGÉ entre dev et prod

> **Écrit le 2026-09-22**, après que Hugo se soit cru bloqué : « quand j'ai fait
> les tests Google en dev ça a quand même créé mon identité via Google, et du
> coup je ne peux plus m'en servir en test prod ».
>
> Il ne l'était pas — mais la surprise était légitime, et rien dans le dépôt ne
> la prévenait.

---

## 1. Le fait

**Il y a UN tenant Auth0, et un seul.** `AUTH0_DOMAIN` vaut la même chose en
développement et en production. Il n'y a ni tenant de recette, ni jeu
d'utilisateurs jetables.

Conséquence directe, et elle vaut pour tous les gestes d'identité :

| Geste fait en DEV                   | Ce qu'il produit réellement                               |
| ----------------------------------- | --------------------------------------------------------- |
| se connecter par Google la 1ʳᵉ fois | **crée un utilisateur `google-oauth2\|…`** dans le tenant |
| rattacher une méthode (vrai compte) | **un rattachement de production**, visible en prod        |
| retirer une méthode (vrai compte)   | **un détachement de production**                          |
| demander un lien de mot de passe    | **un vrai courriel**, à une vraie adresse                 |

⚠️ **« Tester en dev » ne protège de rien** dès que le compte utilisé est un
vrai compte. Ce n'est pas un défaut de montage : c'est le montage.

---

## 2. Le double existe — mais il se choisit par le SUJET, pas par l'environnement

`SubjectRoutedCustomerIdentity` route **par la forme du sujet**, et son JSDoc
explique pourquoi ce n'est pas la configuration qui décide : l'incompatibilité
est par compte, et « renseigner un secret ne devrait pas casser un compte déjà
ouvert ».

```
sujet `dev|…`         → DevCustomerIdentity   → rien ne sort de la machine
sujet `auth0|…`, etc. → Auth0CustomerIdentity → geste RÉEL sur le tenant
```

🔴 **C'est donc le compte sous lequel on est connecté qui décide**, pas le fait
d'être en local. Se connecter avec son vrai compte sur `localhost` envoie tout
chez Auth0 — et c'est exactement le piège.

⚠️ **En production, ce routeur n'est pas monté** : l'adaptateur Auth0 est seul.
Un sujet `dev|…` arrivé en base y est refusé clairement, plutôt que servi depuis
une liste en mémoire — « monter un magasin d'identités factice dans la
production » serait pire que le refus.

---

## 3. Le troisième état, celui qui trompe

Un rattachement fait sous un **faux** compte n'écrit **nulle part** :

```ts
// dev-customer-identity.ts
this.linked.set(subject, [...kept, added]);
this.logger.warn(`[dev] méthode de connexion « ${added.provider} » rattachée localement`);
```

C'est une `Map` **en mémoire**. Elle ne survit pas au redémarrage du serveur, et
elle n'a jamais touché le tenant.

**L'écran, lui, affiche un rattachement réussi** — c'est le but, rendre le
parcours jouable en local. D'où la confusion : on croit avoir consommé son
compte Google alors qu'on n'a rien consommé du tout.

⚠️ Le seul signe distinctif est la ligne de journal `[dev] … rattachée
localement`. **La chercher avant de conclure qu'on a cassé quelque chose.**

---

## 4. Le tableau de sortie

Devant un doute sur l'état réel d'une méthode de connexion, ouvrir
`/mon-profil` **en production** — c'est la seule surface qui lit le tenant :

| Ce que la prod affiche | Ce qui s'est passé                                    | Le geste                       |
| ---------------------- | ----------------------------------------------------- | ------------------------------ |
| la méthode est absente | le lien de dev était **local**                        | rattacher normalement          |
| la méthode est là      | on était sur son **vrai** compte                      | retirer, puis rattacher        |
| le rattachement refuse | la méthode est absorbée par un AUTRE compte du tenant | s'y connecter et l'en détacher |

🔴 **Aucun de ces états n'est un cul-de-sac.** Un rattachement chez Auth0 est
toujours réversible : l'identité secondaire se détache, et elle redevient un
utilisateur autonome du tenant.

⚠️ **Sauf une** : l'identité **principale** ne se détache jamais — c'est elle qui
porte le `sub`, donc le compte. Le bouton de retrait n'apparaît que sur les
secondaires. Rattacher Google **à** un compte existant fait de Google un
secondaire : c'est le bon sens de l'opération, et c'est ce qui la rend
rattrapable.

---

## 5. La règle à retenir

> **Pour éprouver un geste d'identité en local, se connecter avec un compte
> `dev|…`.** Avec un vrai compte, on n'est plus en train de tester : on opère.

Et si le but est justement d'éprouver le chemin Auth0 réel, le faire **en
connaissance de cause**, sur un compte dont on accepte qu'il soit modifié pour
de bon.

---

## 6. Ce que ce document ne tranche pas

Faut-il un **second tenant** pour la recette ? Ça supprimerait le piège à la
racine — au prix d'une seconde configuration à tenir d'accord, et d'un jeu de
comptes à entretenir. Personne ne l'a demandé, et le double par sujet couvre
l'usage courant.

À rouvrir le jour où quelqu'un modifiera un compte **client** par mégarde — le
présent incident n'a coûté qu'une frayeur parce qu'il portait sur le compte de
Hugo.

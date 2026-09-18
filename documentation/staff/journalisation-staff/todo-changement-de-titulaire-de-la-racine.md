# TODO — quand la personne derrière `dev@lafoliedouce.com` change

> Ouvert le 2026-09-18 à la demande de Hugo : « si dans notre activité la
> personne derrière dev@lafoliedouce.com change, il faut qu'on puisse opérer une
> transition qui fige les faits opérés par la personne ayant l'adresse avant ».
>
> Rien n'est codé. Ce document pose le problème et ce que le code en dit
> aujourd'hui (vérifié le 2026-09-18).

## Le problème

`dev@lafoliedouce.com` est une **adresse de fonction**, pas une personne. C'est
l'admin racine (`BOOTSTRAP_ADMIN_EMAIL`, voir
[`architecture-journal-de-l-annuaire.md`](architecture-journal-de-l-annuaire.md)
et [`../architecture-acces-staff.md`](../architecture-acces-staff.md)), et c'est
elle qui a créé toute l'équipe. Le jour où une autre personne reprend cette
boîte, tout ce qui a été fait sous cette adresse doit rester attribué à la
personne d'avant, et tout ce qui sera fait ensuite à la nouvelle.

## Ce qui tient déjà

- **Le journal fige le nom et la fonction de l'auteur à l'écriture**
  (`actor_name`, `actor_role`, par `PrismaActorNamer`). Si la fiche racine porte
  le nom de la personne qui la tient, un changement de nom au moment de la
  passation sépare naturellement les faits d'avant et ceux d'après — et ce
  changement lui-même s'écrit au journal (`staff_user.identity_edited`, avec
  l'avant et l'après).

## Ce qui ne tient pas

- **La fiche racine s'appelle « Admin La Folie Coffee »** (`bootstrap-admin.ts`)
  tant que personne ne la renomme : les faits écrits sous ce nom ne désignent
  personne. C'est aussi le nom qu'a figé la reprise du journal
  ([`plan-reprise-du-journal-de-l-annuaire.md`](plan-reprise-du-journal-de-l-annuaire.md)).
- **`granted_by_staff_id` désigne la fiche, pas la personne** : un droit
  individuel accordé avant la passation et un droit accordé après pointent vers
  le même identifiant. Seule la date les sépare.
- **`actor_id` du journal est le `sub` Auth0**
  ([`todo-le-sub-comme-auteur.md`](todo-le-sub-comme-auteur.md)) : si la
  nouvelle personne garde la même identité Auth0 — même boîte, nouveau mot de
  passe —, le `sub` ne change pas, et le filtre par acteur mélange les deux.
- **La racine est reconnue par son adresse** : `isRoot` compare l'e-mail de la
  fiche à `BOOTSTRAP_ADMIN_EMAIL` (`prisma-staff-user.repository.ts`), et
  `ensureBootstrapAdmin` recrée une fiche à cette adresse si elle manque. Changer
  la variable fait naître une nouvelle racine et libère l'ancienne de ses
  protections — un geste de passation possible, mais qui n'est écrit nulle part.

## Pistes, à trancher

1. **Nommer la personne, dès maintenant.** Renommer la fiche racine du nom de
   la personne qui la tient : les faits suivants porteront un vrai nom. Ça ne
   répare pas les faits déjà écrits sous « Admin La Folie Coffee ».
2. **Une passation, geste explicite.** Un geste d'administration qui, dans une
   transaction : écrit un fait `staff_user.handed_over` (de qui, à qui, quand),
   renomme la fiche, et oblige la nouvelle personne à choisir son mot de passe
   (lien neuf, l'ancien invalidé). La date de ce fait devient la frontière
   lisible entre les deux titulaires.
3. **Séparer la racine des personnes.** La racine ne sert plus qu'en secours ;
   chaque personne a sa propre fiche, à son adresse, avec son rôle. La passation
   se réduit alors à donner la boîte de secours à quelqu'un d'autre — les faits
   du quotidien n'ont jamais été écrits sous l'adresse de fonction. C'est la
   piste qui fige le mieux, mais elle change l'usage, pas seulement le code.

Dans tous les cas, **l'ancienne personne ne doit pas garder d'accès** : une
passation qui laisse l'ancien mot de passe valide n'en est pas une.

Touche à une frontière de sécurité (qui est la racine, qui peut entrer) :
`vitruve` avant de soumettre un plan.

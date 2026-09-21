# Trois e2e ne passent qu'à condition d'être seules

> **Ouvert le 2026-09-21.** Constaté, pas diagnostiqué — chacune a été rejouée
> isolément le jour même et passe.

## Le fait

Sous `pnpm test` à la racine, trois suites échouent **par intermittence** et
passent **systématiquement** quand on les relance seules :

| Suite                          | Le cas qui tombe                                               |
| ------------------------------ | -------------------------------------------------------------- |
| `production-batch.e2e-spec.ts` | un **compte de mails**                                         |
| `client-notes.e2e-spec.ts`     | « deux écritures simultanées › gardent les trois notes »       |
| `appointments.e2e-spec.ts`     | « les créneaux › ne propose rien tant que rien n'est déclaré » |

## Pourquoi ça compte plus qu'un agacement

🔴 **Une suite qui échoue une fois sur cinq finit par être crue quand elle
ment.** Le coût n'est pas le rouge : c'est qu'on apprend à relancer plutôt qu'à
lire, et le jour où l'une d'elles attrape une vraie régression, personne ne la
croit.

Et les trois portent des sujets où l'ordre compte vraiment — un compteur
d'e-mails partis, une **course** entre deux écritures, une fenêtre de créneaux.
Ce sont exactement les endroits où un état qui bave d'une suite à l'autre
ressemble à un défaut du produit.

## Les trois pistes, par ordre de vraisemblance

1. **Du travail hors requête qui écrit APRÈS le `TRUNCATE`.** `e2e-harness.ts`
   draine avant de vider (`background.whenIdle()`), et son commentaire dit
   précisément pourquoi — « son alerte réapparaît alors dans le test suivant,
   un échec qui accuse le mauvais test, une fois sur sept ». Un abonné qui
   n'est pas dans ce drain reproduit le symptôme.
2. **Un état de module partagé entre suites** — un cache que `ctx.reset()` ne
   vide pas. Le cache des matériaux de prix, lui, est explicitement vidé ;
   d'autres ne le sont peut-être pas.
3. **Une fixture datée relative à `maintenant`** dont la fenêtre se ferme
   pendant que les suites d'avant tournent. Le § 5 du CLAUDE.md a déjà coûté
   ça une fois, dans l'autre sens.

## Ce qu'il ne faut PAS faire

Ne pas les marquer `skip`, et ne pas les « stabiliser » en élargissant une
attente. Ce qui rend une de ces suites verte sans en comprendre la cause enlève
le seul signal qui reste.

**Le geste utile** : lancer la suite complète en boucle jusqu'à reproduire, puis
relancer la seule suite qui précède immédiatement celle qui tombe. C'est
l'ordre, donc le coupable est devant.

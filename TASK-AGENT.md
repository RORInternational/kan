# TASK-AGENT.md — running the ROR International board

**This is not a guide to the codebase.** `AGENTS.md` and `CLAUDE.md` cover
working *on* Kan. This file covers working *with* it: the conventions an AI
agent needs when it drives our live board over MCP.

**How to use it.** Copy this file into whatever project you point Codex at, as
that project's `AGENTS.md`. Each person needs their own copy and their own API
key. When the rules here change, update this file and re-copy — three drifting
copies are worse than none.

---

You manage the team's Kan board through the `Kan_task_manager` MCP server.
Everything below is true of the live system; trust it instead of rediscovering
it.

## Who you are acting as

The API key belongs to the person talking to you. Every card you create or move
is authored by **them**, and you have exactly their permissions. If an action is
refused, that is a real permission boundary, not a bug to work around.

## The system

One workspace, one board. Never ask which, and never call `list_workspaces` or
`list_boards` to find them.

```
workspace  ROR International   ssbfmiv9iotx
board      Daily Execution     57lanjtv8i7k
```

Older boards (KZR, gogogo, basic-roadmap, awesomeai-development,
kanban-develop, test) were deleted on 2026-08-18. They no longer exist. If
someone refers to one, say it was removed and ask what they want on Daily
Execution instead.

## This board drives the office wall

The wall shows a **matrix**: outcomes down the side, people across the top. A
card's position on that screen comes from three separate things, and it needs
**all three** or it appears nowhere:

| What | Where it lives | On the wall |
| ---- | -------------- | ----------- |
| stage | the **list** the card is in | the card's colour |
| outcome | a **label** on the card | which **row** |
| owner | an **assigned member** | which **column** |

## Labels are outcomes, not tags

**This is the rule that matters most.** On this board a label is not a free-form
tag. Each label is a **row on the office wall**.

```
lpf0hqz3nwem   Finish the investment deck    (blue)
74nfldn2bqel   Sort out investors            (purple)
v17r7bfxigp4   Clean up the main website     (green)
e45r9tjk1133   Blocked                       (red)  ← a flag, not an outcome
```

Rules, in order of how badly they break things:

1. **Never create a new label.** `create_label` adds a row to the wall. A new
   outcome is a decision about what the company is working on this quarter — it
   is the team's call, not yours. If nothing fits, say so and ask.
2. **Never rename or delete a label**, and in particular **never rename
   `Blocked`**. The wall recognises that flag by its name. Rename it and every
   blocked card silently loses its marker while a bogus fourth row appears.
3. **Exactly one outcome label per card.** Two outcome labels put the same card
   in two rows and count it toward both percentages, so the numbers stop adding
   up.
4. **`Blocked` is additional, never instead.** A blocked card still needs its
   outcome label. A card can be blocked at any stage.

## Stages

```
mbog3csw7jxc   Next
fxwln6x5fytc   Working now
crpnnoozkvqu   Done          ← the progress bars read the LAST list as done
```

**Never reorder these lists.** The percentages are computed as "cards in the
last list ÷ cards with that label". Move `Done` out of last position and every
number on the wall is wrong, with no error anywhere.

Progress is never stored — moving a card recomputes it. To mark something
finished, move the card to `Done`. Do not create a duplicate "done" card.

## People

```
pwp0wyvntlr0   Kim
s7a5nvgdsjas   reuben
b95qqdgw8c1a   zach
7wxf159q2yo6   accounts ror
1neq2h0s3b6t   display        ← the wall screen's own login. Never assign to it.
```

## Creating a card

`create_card` treats `labelPublicIds` and `memberPublicIds` as optional. **On
this board they are not.** A card created with only a title and a list is
invisible on the wall — it is counted at the foot of the screen as "not shown",
which is the only sign anything went wrong.

```
create_card
  listPublicId     mbog3csw7jxc          Next
  title            "Draft the Q3 summary"
  labelPublicIds   ["74nfldn2bqel"]      one outcome — required here
  memberPublicIds  ["s7a5nvgdsjas"]      one owner — required here
```

If the person has not said which outcome or who owns it, **ask**. Do not guess,
and do not create the card without them.

After writing, state back what you did: the card, its outcome, its owner and
its stage. That is how the person catches a missing piece before it reaches the
wall.

## Working efficiently

Every write needs a 12-character `publicId`; names are never accepted. The IDs
above are pinned, so the cheap path is one `get_board` (which returns the
current lists, labels and members) and then your write — two calls, not four.

Treat the pinned block as a cache. If someone has just added a member, call
`get_board` and use what it returns.

## Rules

**Ask before destroying anything.** `delete_card`, `delete_list`,
`delete_board`, `delete_workspace` and `remove_member` are all available and
none of them prompt. Never call one unless the person asked to delete that
specific thing. "Tidy up the board" is not permission to delete cards.

**Never create workspaces or boards.** There is one of each and it should stay
that way.

**Report failures plainly.** If a call errored, say so with the error. Never
imply a card was created when it was not.

## Card conventions

- Titles start with a verb and stay short: "Fix the login redirect", not "login bug".
- Detail goes in the description, not the title.
- New work starts in `Next` unless told otherwise.

## When unsure

Ask. One clarifying question is much cheaper than a card that silently never
appears on the wall, or a stray label that adds a row nobody wanted.

import type { RouterOutputs } from "~/utils/api";

type Board = NonNullable<RouterOutputs["board"]["byId"]>;
type Card = Board["lists"][number]["cards"][number];

/**
 * A label with this name is a flag, not an outcome row. Matched loosely on
 * purpose: someone typing "blocked" by hand should not silently gain an extra
 * row and lose the blocked marker at the same time.
 */
const BLOCKED_LABEL = "blocked";

export const isBlockedLabel = (name: string) =>
  name.trim().toLowerCase() === BLOCKED_LABEL;

export const isBlocked = (card: Card) =>
  card.labels.some((l) => isBlockedLabel(l.name));

/**
 * Overdue is judged against the start of today, not the current moment: a card
 * due "3 Sep" is not late at 9am on the 3rd.
 */
export const isOverdue = (due: Date) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return due.getTime() < startOfToday.getTime();
};

export interface MatrixCard {
  card: Card;
  stage: string;
  isDone: boolean;
  /**
   * In flight: not waiting in the first list, not finished in the last one.
   *
   * Derived from position for the same reason `isDone` is — the list names are
   * the team's to change. This used to be `stage.includes("working")`, which
   * meant renaming "Working now" would have silently dropped the blue stage
   * colour and the next-step line with no error anywhere.
   */
  isWorking: boolean;
  blocked: boolean;
}

export interface Matrix {
  /** Rows. Every label except the Blocked flag. */
  outcomes: Board["labels"];
  /** Columns. Only people who actually have a card here. */
  people: Board["workspace"]["members"];
  cellOf: (labelPublicId: string, memberPublicId: string) => MatrixCard[];
  progressOf: (labelPublicId: string) => { done: number; total: number };
  /** The same count for one person, across every outcome. */
  progressOfPerson: (memberPublicId: string) => { done: number; total: number };
  /** Cards that belong in no cell, so the UI can say so rather than drop them. */
  hidden: number;
  totals: { all: number; done: number };
}

/**
 * Pivots a board into outcomes × people.
 *
 * Both axes are independent many-to-many relations off the same card — labels
 * for the outcome, assigned members for the person — so a cell is just their
 * intersection. The card's list is its stage, which becomes a colour rather
 * than a third axis.
 *
 * "Done" is the last list: Kan has no isDone flag, so order is the only signal.
 * Everything between the first list and the last one is in flight.
 */
export function buildMatrix(board: Board): Matrix {
  const lastIndex = board.lists.length - 1;
  const doneListId = board.lists.length
    ? board.lists[lastIndex]?.publicId
    : undefined;

  const rows: MatrixCard[] = board.lists.flatMap((list, listIndex) =>
    list.cards.map((card) => ({
      card,
      stage: list.name,
      isDone: list.publicId === doneListId,
      isWorking: listIndex > 0 && listIndex < lastIndex,
      blocked: isBlocked(card),
    })),
  );

  const outcomes = board.labels.filter((l) => !isBlockedLabel(l.name));

  const assigned = new Set(
    rows.flatMap(({ card }) => card.members.map((m) => m.publicId)),
  );
  const people = board.workspace.members.filter(
    (m) => m.user && assigned.has(m.publicId),
  );

  const cellOf = (labelPublicId: string, memberPublicId: string) =>
    rows.filter(
      ({ card }) =>
        card.labels.some((l) => l.publicId === labelPublicId) &&
        card.members.some((m) => m.publicId === memberPublicId),
    );

  const progressOf = (labelPublicId: string) => {
    const forLabel = rows.filter(({ card }) =>
      card.labels.some((l) => l.publicId === labelPublicId),
    );
    return {
      done: forLabel.filter((r) => r.isDone).length,
      total: forLabel.length,
    };
  };

  const progressOfPerson = (memberPublicId: string) => {
    const theirs = rows.filter(({ card }) =>
      card.members.some((m) => m.publicId === memberPublicId),
    );
    return {
      done: theirs.filter((r) => r.isDone).length,
      total: theirs.length,
    };
  };

  const outcomeIds = new Set(outcomes.map((o) => o.publicId));
  const hidden = rows.filter(
    ({ card }) =>
      !card.labels.some((l) => outcomeIds.has(l.publicId)) ||
      card.members.length === 0,
  ).length;

  return {
    outcomes,
    people,
    cellOf,
    progressOf,
    progressOfPerson,
    hidden,
    totals: { all: rows.length, done: rows.filter((r) => r.isDone).length },
  };
}

/**
 * A card's own progress, from its checklist items across every group — the
 * groups are only a heading, so they are flattened before counting.
 *
 * Returns null rather than 0/0 when the card has no checklist: "nobody wrote
 * any steps" and "no step is done yet" are different things, and a UI that
 * renders them the same reads as the second one.
 */
export const checklistProgress = (card: Card) => {
  const items = card.checklists.flatMap((c) => c.items);
  if (!items.length) return null;
  return {
    done: items.filter((i) => i.completed).length,
    total: items.length,
  };
};

/**
 * The first step nobody has ticked yet, in the order a person reads them:
 * groups in their own order, items within each group in theirs.
 *
 * This is the one thing on a wall card that is not derivable from anything
 * else on it — "what is he actually doing right now".
 */
export const nextStep = (card: Card) => {
  for (const list of card.checklists) {
    for (const item of list.items) {
      if (!item.completed) return item.title;
    }
  }
  return null;
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/** Colours for the person columns, in order. */
export const PERSON_COLOURS = [
  "#2563EB",
  "#7C3AED",
  "#0F766E",
  "#C2410C",
  "#BE185D",
  "#A16207",
];

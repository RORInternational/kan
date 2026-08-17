import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import type { RouterOutputs } from "~/utils/api";
import { api } from "~/utils/api";

/** How often to pull fresh board data. */
const POLL_MS = 10_000;
/** How long a card stays highlighted after it appears or moves. */
const FRESH_MS = 90_000;
/**
 * Cards shown per lane/cell before collapsing the rest into "+N more".
 * The screen is a fixed height, so without a cap the last card is clipped
 * mid-card and silently disappears. Raise if lanes look sparse.
 */
const MAX_CARDS_PER_LANE = 5;
const MAX_CARDS_PER_CELL = 3;
/** A label with this name is a flag, not an outcome row. */
const BLOCKED_LABEL = "Blocked";

type Board = NonNullable<RouterOutputs["board"]["byId"]>;
type Card = Board["lists"][number]["cards"][number];

const LANE_COLOURS = [
  "#2563EB",
  "#C2410C",
  "#7C3AED",
  "#0F766E",
  "#BE185D",
  "#A16207",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const formatDue = (due: Date) =>
  due.toLocaleDateString("en-AU", { day: "numeric", month: "short" });

const isBlocked = (card: Card) =>
  card.labels.some((l) => l.name === BLOCKED_LABEL);

const useClock = () => {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

const useAgo = (stamp: number | null) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (stamp === null) return null;
  return Math.max(0, Math.round((Date.now() - stamp) / 1000));
};

export default function TvView() {
  const router = useRouter();
  const boardId = Array.isArray(router.query.boardId)
    ? router.query.boardId[0]
    : router.query.boardId;
  // Matrix is what the wall shows. ?view=lanes stays as an escape hatch for a
  // board whose lists are people rather than stages, which has no matrix to
  // draw — it is not offered in the UI.
  const isMatrix = router.query.view !== "lanes";

  const {
    data: board,
    dataUpdatedAt,
    isError,
    isPending,
  } = api.board.byId.useQuery(
    { boardPublicId: boardId ?? "" },
    {
      enabled: !!boardId,
      refetchInterval: POLL_MS,
      // Keep the wall showing the last good data while a refetch is in flight,
      // so it never flashes a loading state at the room.
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: true,
    },
  );

  const clock = useClock();
  const ago = useAgo(dataUpdatedAt || null);

  // Remember when each card was first seen in its current list, so a new or
  // moved card can be highlighted briefly.
  const seen = useRef(new Map<string, { list: string; at: number }>());
  // The first snapshot is the existing state of the board, not news. Without
  // this every card would light up as "just now" when the screen boots.
  const primed = useRef(false);
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!board) return;
    const stamp = primed.current ? Date.now() : 0;
    for (const list of board.lists) {
      for (const card of list.cards) {
        const prev = seen.current.get(card.publicId);
        if (!prev || prev.list !== list.publicId) {
          seen.current.set(card.publicId, { list: list.publicId, at: stamp });
        }
      }
    }
    primed.current = true;
    const id = setInterval(() => forceTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [board]);

  const freshFor = (publicId: string) => {
    const mark = seen.current.get(publicId);
    // at === 0 marks a card that was already there on first load.
    return !!mark && mark.at > 0 && Date.now() - mark.at < FRESH_MS;
  };

  if (isError) {
    return (
      <Shell>
        <p className="text-[2vw] font-semibold text-red-600">
          Can&rsquo;t load this board. Check the display account is signed in.
        </p>
      </Shell>
    );
  }

  if (isPending || !board) {
    return (
      <Shell>
        <p className="text-[2vw] font-semibold text-light-900">Loading board…</p>
      </Shell>
    );
  }

  const doneListId = board.lists.length
    ? board.lists[board.lists.length - 1]?.publicId
    : undefined;
  const allCards = board.lists.flatMap((l) => l.cards);
  const doneCount = doneListId
    ? (board.lists.find((l) => l.publicId === doneListId)?.cards.length ?? 0)
    : 0;

  return (
    <div className="tv-root flex h-screen w-screen flex-col overflow-hidden bg-light-100 text-light-1000">
      <header className="flex flex-none items-center justify-between border-b border-light-300 bg-light-50 px-[2.2vw] pb-[1.1vw] pt-[1.5vw]">
        <div className="flex items-baseline gap-[1.2vw]">
          <h1 className="text-[3vw] font-extrabold leading-none tracking-[-0.04em] text-light-1000">
            {board.name}
          </h1>
          <span className="text-[1.05vw] font-semibold uppercase tracking-[0.22em] text-light-900">
            {board.workspace.cardPrefix}
          </span>
        </div>
        <div className="flex items-center gap-[2vw]">
          <div className="text-right">
            <p className="text-[1.7vw] font-extrabold tabular-nums leading-none tracking-[-0.02em]">
              {doneCount} of {allCards.length}
            </p>
            <p className="text-[0.9vw] font-semibold text-light-900">
              tasks complete
            </p>
          </div>
          <span className="flex items-center gap-[0.55vw] text-[1.05vw] font-bold tracking-[0.14em] text-emerald-700">
            <span className="tv-pulse h-[0.7vw] w-[0.7vw] rounded-full bg-emerald-600" />
            LIVE
          </span>
          <span className="text-[1.9vw] font-bold tabular-nums tracking-[-0.02em]">
            {clock
              ? clock.toLocaleTimeString("en-AU", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })
              : "--:--"}
          </span>
        </div>
      </header>

      {isMatrix ? (
        <MatrixLayout
          board={board}
          doneListId={doneListId}
          freshFor={freshFor}
        />
      ) : (
        <LaneLayout board={board} doneListId={doneListId} freshFor={freshFor} />
      )}

      <footer className="flex flex-none items-center justify-between border-t border-light-300 bg-light-50 px-[2.2vw] py-[0.85vw] text-[1vw] font-semibold text-light-950">
        <div className="flex items-center gap-[1.6vw]">
          <Key colour="#2563EB" label="Working now" />
          <Key colour="#E58E14" label="Next" />
          <Key colour="#1FAE6B" label="Done" />
          <Key colour="#DC2626" label="Blocked" />
        </div>
        <span className="text-light-900">
          {ago === null
            ? "syncing…"
            : ago < 60
              ? `updated ${ago}s ago`
              : `updated ${Math.floor(ago / 60)}m ago`}
        </span>
      </footer>

      <style jsx global>{`
        /* The wall display is a fixed light surface; the viewer's OS theme
           should not flip it, since the room's screen is not personal. */
        .tv-root {
          color-scheme: light;
          background-image: radial-gradient(
            circle at 1px 1px,
            hsl(0deg 0% 85%) 1px,
            transparent 0
          );
          background-size: 22px 22px;
        }
        .tv-pulse {
          animation: tvpulse 2.4s infinite;
        }
        @keyframes tvpulse {
          0% {
            box-shadow: 0 0 0 0 rgba(5, 150, 105, 0.45);
          }
          70% {
            box-shadow: 0 0 0 1.1vw rgba(5, 150, 105, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(5, 150, 105, 0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tv-pulse {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrix: rows are outcome labels, columns are the people assigned    */
/* ------------------------------------------------------------------ */

function MatrixLayout({
  board,
  doneListId,
  freshFor,
}: {
  board: Board;
  doneListId: string | undefined;
  freshFor: (publicId: string) => boolean;
}) {
  const { outcomes, people, cellOf, progressOf, hidden } = useMemo(() => {
    const withStage = board.lists.flatMap((list) =>
      list.cards.map((card) => ({
        card,
        stage: list.name,
        isDone: list.publicId === doneListId,
      })),
    );

    const outcomes = board.labels.filter((l) => l.name !== BLOCKED_LABEL);

    // Only show people who actually have cards here — listing every workspace
    // member would fill the screen with empty columns.
    const assigned = new Set(
      withStage.flatMap(({ card }) => card.members.map((m) => m.publicId)),
    );
    const people = board.workspace.members.filter(
      (m) => m.user && assigned.has(m.publicId),
    );

    const cellOf = (labelPublicId: string, memberPublicId: string) =>
      withStage.filter(
        ({ card }) =>
          card.labels.some((l) => l.publicId === labelPublicId) &&
          card.members.some((m) => m.publicId === memberPublicId),
      );

    const progressOf = (labelPublicId: string) => {
      const rows = withStage.filter(({ card }) =>
        card.labels.some((l) => l.publicId === labelPublicId),
      );
      const done = rows.filter((r) => r.isDone).length;
      return { done, total: rows.length };
    };

    // A card with no outcome label, or nobody assigned, lands in no cell.
    // Say so rather than letting it vanish.
    const outcomeIds = new Set(outcomes.map((o) => o.publicId));
    const hidden = withStage.filter(
      ({ card }) =>
        !card.labels.some((l) => outcomeIds.has(l.publicId)) ||
        card.members.length === 0,
    ).length;

    return { outcomes, people, cellOf, progressOf, hidden };
  }, [board, doneListId]);

  if (!outcomes.length || !people.length) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-[6vw] text-center">
        <p className="text-[1.5vw] font-semibold leading-relaxed text-light-950">
          Matrix view needs outcome labels and cards assigned to people.
          <br />
          <span className="text-[1.15vw] font-medium text-light-900">
            {!outcomes.length
              ? "This board has no labels other than “Blocked”."
              : "No card on this board has an assignee yet."}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div
      className="grid min-h-0 flex-1"
      style={{
        gridTemplateColumns: `1.25fr repeat(${people.length}, minmax(0, 1fr))`,
        gridTemplateRows: `auto repeat(${outcomes.length}, minmax(0, 1fr))`,
      }}
    >
      {/* header row */}
      <div className="flex items-center border-b-[0.16vw] border-light-500 bg-light-200 px-[1.1vw] py-[0.8vw]">
        <span className="text-[0.9vw] font-bold uppercase tracking-[0.18em] text-light-950">
          Key outcomes
        </span>
      </div>
      {people.map((p, i) => (
        <div
          key={p.publicId}
          className="flex items-center gap-[0.6vw] border-b-[0.16vw] border-light-500 border-l border-l-light-300 bg-light-50 px-[1vw] py-[0.8vw]"
        >
          <span
            className="flex h-[2vw] w-[2vw] flex-none items-center justify-center rounded-full text-[0.95vw] font-extrabold text-white"
            style={{ background: LANE_COLOURS[i % LANE_COLOURS.length] }}
          >
            {initials(p.user?.name ?? p.email)}
          </span>
          <span className="truncate text-[1.5vw] font-bold tracking-[-0.02em]">
            {p.user?.name ?? p.email}
          </span>
        </div>
      ))}

      {/* one row per outcome */}
      {outcomes.map((o, rowIndex) => {
        const { done, total } = progressOf(o.publicId);
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <MatrixRow
            key={o.publicId}
            outcome={o}
            rowIndex={rowIndex}
            people={people}
            cellOf={cellOf}
            done={done}
            total={total}
            pct={pct}
            freshFor={freshFor}
          />
        );
      })}

      {hidden > 0 && (
        <div
          className="col-span-full border-t border-light-300 bg-light-200 px-[1.1vw] py-[0.5vw] text-[0.9vw] font-semibold text-light-950"
          style={{ gridColumn: "1 / -1" }}
        >
          {hidden} card{hidden > 1 ? "s" : ""} not shown — needs an outcome
          label and an assignee
        </div>
      )}
    </div>
  );
}

function MatrixRow({
  outcome,
  rowIndex,
  people,
  cellOf,
  done,
  total,
  pct,
  freshFor,
}: {
  outcome: Board["labels"][number];
  rowIndex: number;
  people: Board["workspace"]["members"];
  cellOf: (
    labelPublicId: string,
    memberPublicId: string,
  ) => { card: Card; stage: string; isDone: boolean }[];
  done: number;
  total: number;
  pct: number;
  freshFor: (publicId: string) => boolean;
}) {
  return (
    <>
      <div className="flex flex-col justify-center border-b border-light-300 bg-light-200 px-[1.1vw] py-[0.8vw]">
        <p className="mb-[0.15vw] text-[0.82vw] font-bold uppercase tracking-[0.16em] text-light-900">
          Outcome {String(rowIndex + 1).padStart(2, "0")}
        </p>
        <p className="text-[1.4vw] font-bold leading-[1.2] tracking-[-0.02em] text-light-1000">
          {outcome.name}
        </p>
        <div className="mt-[0.6vw] flex items-center gap-[0.6vw]">
          <span className="h-[0.5vw] flex-1 overflow-hidden rounded-full bg-light-500">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: outcome.colourCode ?? "#1FAE6B",
              }}
            />
          </span>
          <span className="text-[0.98vw] font-extrabold tabular-nums text-light-950">
            {pct}%
          </span>
        </div>
        <p className="mt-[0.1vw] text-[0.8vw] font-semibold text-light-900">
          {done} / {total} done
        </p>
      </div>

      {people.map((p) => {
        const items = cellOf(outcome.publicId, p.publicId);
        return (
          <div
            key={p.publicId}
            className="flex min-h-0 flex-col gap-[0.42vw] overflow-hidden border-b border-light-300 border-l border-l-light-300 p-[0.55vw]"
          >
            {items.slice(0, MAX_CARDS_PER_CELL).map(({ card, stage, isDone }) => {
              const blocked = isBlocked(card);
              const fresh = freshFor(card.publicId);
              return (
                <article
                  key={card.publicId}
                  className="rounded-[0.45vw] border bg-light-50 px-[0.62vw] py-[0.5vw]"
                  style={
                    fresh
                      ? { borderColor: "#059669", background: "#F0FDF6" }
                      : blocked
                        ? { borderColor: "#F5C4C4", background: "#FEF2F2" }
                        : isDone
                          ? { borderColor: "#E3E7EA", background: "#F4F7F5" }
                          : stage.toLowerCase().includes("working")
                            ? { borderColor: "#B9D2FA", background: "#EEF4FF" }
                            : { borderColor: "#E3E7EA" }
                  }
                >
                  <div className="flex items-start gap-[0.5vw]">
                    <span
                      className="mt-[0.28vw] h-[0.6vw] w-[0.6vw] flex-none rounded-full"
                      style={{
                        background: blocked
                          ? "#DC2626"
                          : isDone
                            ? "#1FAE6B"
                            : stage.toLowerCase().includes("working")
                              ? "#2563EB"
                              : "#E58E14",
                      }}
                    />
                    <div className="min-w-0">
                      <p
                        className={`text-[1.02vw] font-semibold leading-[1.26] text-light-1000 ${
                          isDone ? "line-through opacity-60" : ""
                        }`}
                      >
                        {card.title}
                      </p>
                      <p className="mt-[0.05vw] text-[0.82vw] font-semibold text-light-900">
                        {blocked ? "Blocked" : stage}
                        {card.dueDate && ` · ${formatDue(new Date(card.dueDate))}`}
                      </p>
                    </div>
                  </div>
                </article>
              );
            })}
            {items.length > MAX_CARDS_PER_CELL && (
              <p className="text-center text-[0.85vw] font-bold text-light-900">
                + {items.length - MAX_CARDS_PER_CELL} more
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lanes: the original one-column-per-list view                        */
/* ------------------------------------------------------------------ */

function LaneLayout({
  board,
  doneListId,
  freshFor,
}: {
  board: Board;
  doneListId: string | undefined;
  freshFor: (publicId: string) => boolean;
}) {
  return (
    <div
      className="grid min-h-0 flex-1 gap-[1.3vw] px-[2.2vw] py-[1.5vw]"
      style={{
        gridTemplateColumns: `repeat(${Math.max(board.lists.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {board.lists.map((list, i) => {
        const accent = LANE_COLOURS[i % LANE_COLOURS.length] ?? "#2563EB";
        return (
          <section key={list.publicId} className="flex min-h-0 flex-col">
            <div className="mb-[1vw] flex flex-none items-center gap-[0.9vw]">
              <span
                className="flex h-[2.5vw] w-[2.5vw] flex-none items-center justify-center rounded-full text-[1.2vw] font-extrabold text-white"
                style={{ background: accent }}
              >
                {initials(list.name)}
              </span>
              <h2 className="text-[1.85vw] font-bold tracking-[-0.02em] text-light-1000">
                {list.name}
              </h2>
              <span className="ml-auto rounded-full bg-light-300 px-[0.9vw] py-[0.15vw] text-[1.15vw] font-bold tabular-nums text-light-950">
                {list.cards.length}
              </span>
            </div>
            <div
              className="mb-[1vw] h-[0.35vw] flex-none rounded-full"
              style={{ background: accent }}
            />

            <div className="flex min-h-0 flex-col gap-[0.9vw] overflow-hidden">
              {list.cards.length === 0 && (
                <p className="rounded-[0.7vw] border border-dashed border-light-500 px-[1.5vw] py-[1.6vw] text-center text-[1.2vw] font-semibold text-light-800">
                  Nothing here
                </p>
              )}

              {list.cards.slice(0, MAX_CARDS_PER_LANE).map((card) => {
                const isDone = list.publicId === doneListId;
                const fresh = freshFor(card.publicId);
                return (
                  <article
                    key={card.publicId}
                    className="rounded-[0.7vw] border border-light-300 bg-light-50 px-[1.4vw] py-[1.25vw] shadow-sm"
                    style={
                      fresh
                        ? {
                            borderColor: "#059669",
                            boxShadow: "0 0 0 0.18vw rgba(5,150,105,0.18)",
                            background: "#F0FDF6",
                          }
                        : undefined
                    }
                  >
                    {card.cardNumber !== null && (
                      <p className="mb-[0.45vw] text-[1vw] font-bold tracking-[0.1em] text-light-800">
                        {board.workspace.cardPrefix}-{card.cardNumber}
                      </p>
                    )}
                    <h3 className="text-[1.6vw] font-semibold leading-[1.3] tracking-[-0.015em] text-light-1000">
                      {card.title}
                    </h3>
                    <div className="mt-[0.95vw] flex items-center gap-[1vw]">
                      <span
                        className={`inline-flex items-center gap-[0.45vw] rounded-full px-[0.85vw] py-[0.3vw] text-[1vw] font-bold ${
                          isDone
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        }`}
                      >
                        <span
                          className={`h-[0.6vw] w-[0.6vw] rounded-full ${
                            isDone ? "bg-emerald-600" : "bg-red-500"
                          }`}
                        />
                        {isDone ? "Done" : "Not done"}
                      </span>
                      {card.dueDate && (
                        <span className="text-[1.05vw] font-semibold text-light-900">
                          {formatDue(new Date(card.dueDate))}
                        </span>
                      )}
                      {fresh && (
                        <span className="ml-auto text-[0.85vw] font-extrabold uppercase tracking-[0.12em] text-emerald-700">
                          just now
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}

              {list.cards.length > MAX_CARDS_PER_LANE && (
                <p className="flex-none text-center text-[1.15vw] font-bold text-light-900">
                  + {list.cards.length - MAX_CARDS_PER_LANE} more
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="flex items-center gap-[0.4vw]">
      <span
        className="h-[0.6vw] w-[0.6vw] rounded-full"
        style={{ background: colour }}
      />
      {label}
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-light-100">
      {children}
    </div>
  );
}

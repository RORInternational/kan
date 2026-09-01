import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import type { RouterOutputs } from "~/utils/api";
import { api } from "~/utils/api";
import {
  buildMatrix,
  checklistProgress,
  initials,
  isBlocked,
  nextStep,
} from "~/utils/matrix";

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
// Two, not three: the cards now carry a progress row and a due date, so a
// third one no longer fits a cell without crowding the two that matter.
const MAX_CARDS_PER_CELL = 2;
/** Past this many steps the pips are thinner than the gaps between them. */
const MAX_PIPS = 8;
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

const formatDue = (due: Date) =>
  due.toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/**
 * Overdue is judged against the start of today, not the current moment: a card
 * due "3 Sep" is not late at 9am on the 3rd. The board page draws the same line.
 */
const isOverdue = (due: Date) => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return due.getTime() < startOfToday.getTime();
};

/**
 * The status indicator, which doubles as the card's own progress.
 *
 * A solid disc means the card has no checklist — status only, nothing to
 * report. A ring means it does, and the arc is how far along it is. Two shapes
 * rather than an empty ring, because an empty ring reads as "no step done yet"
 * when the truth is "nobody wrote any steps".
 *
 * 1.6vw is the floor for this: on a 55" screen at 5m an arc smaller than that
 * is visible but its endpoints are not, so the fill cannot be judged.
 */
function StatusMark({
  colour,
  progress,
}: {
  colour: string;
  progress: { done: number; total: number } | null;
}) {
  if (!progress) {
    return (
      <span
        className="flex h-[1.6vw] w-[1.6vw] flex-none items-center justify-center"
        aria-hidden
      >
        <span
          className="h-[0.8vw] w-[0.8vw] rounded-full"
          style={{ background: colour }}
        />
      </span>
    );
  }

  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <svg
      viewBox="0 0 32 32"
      className="h-[1.6vw] w-[1.6vw] flex-none -rotate-90"
      role="img"
      aria-label={`${progress.done} of ${progress.total} steps done`}
    >
      <circle cx="16" cy="16" r="13" fill="none" stroke="#D9DDE2" strokeWidth="4.5" />
      {pct > 0 && (
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke={colour}
          strokeWidth="4.5"
          strokeLinecap="round"
          // pathLength normalises the circumference to 100 so the dash array is
          // just the percentage — no 2*pi*r arithmetic to keep in sync with r.
          pathLength={100}
          strokeDasharray={`${pct} ${100 - pct}`}
        />
      )}
    </svg>
  );
}

/**
 * The page already fills the window, but a browser still shows its own chrome.
 * Kiosk mode handles the wall machine; this is for anyone opening Showcase from
 * their desk. The control fades out so it does not sit on the wall all day.
 */
const useFullscreen = () => {
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const sync = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };
  return { isFull, toggle };
};

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
  const { isFull, toggle: toggleFullscreen } = useFullscreen();

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
  // The one number on this screen that asks someone to do something.
  const blockedCount = allCards.filter(isBlocked).length;

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
          {blockedCount > 0 && (
            <span className="flex items-center gap-[0.6vw] rounded-[0.4vw] bg-[#FEE9E9] px-[0.9vw] py-[0.45vw]">
              <span className="h-[0.8vw] w-[0.8vw] flex-none rounded-full bg-[#DC2626]" />
              <span className="text-[1.2vw] font-extrabold uppercase tracking-[0.1em] text-[#B91C1C]">
                {blockedCount} blocked
              </span>
            </span>
          )}
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
        <MatrixLayout board={board} freshFor={freshFor} />
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
        <span className="flex items-center gap-[1.2vw]">
          <span className="text-light-900">
            {ago === null
              ? "syncing…"
              : ago < 60
                ? `updated ${ago}s ago`
                : `updated ${Math.floor(ago / 60)}m ago`}
          </span>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="tv-fs rounded border border-light-400 bg-light-100 px-[0.8vw] py-[0.25vw] text-[0.95vw] font-bold text-light-950 hover:bg-light-200"
          >
            {isFull ? "Exit full screen" : "Full screen"}
          </button>
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
        /* On the wall nobody clicks this, so let it fade once fullscreen. */
        .tv-fs {
          opacity: 1;
          transition: opacity 0.4s;
        }
        :fullscreen .tv-fs {
          opacity: 0;
        }
        :fullscreen:hover .tv-fs {
          opacity: 1;
        }
        /*
         * The checklist panel is a desk affordance, opened from Showcase with a
         * mouse. Plain CSS on purpose: this page re-renders every 10 seconds, so
         * holding "which card is hovered" in React state would make the panel
         * flicker on every poll.
         */
        .tv-peek {
          display: none;
        }
        .tv-card:hover .tv-peek {
          display: block;
        }
        .tv-card:hover {
          z-index: 20;
        }
        /* A kiosk pointer parked over a card would leave one open all day. */
        :fullscreen .tv-card:hover .tv-peek {
          display: none;
        }
        @media (hover: none) {
          .tv-card:hover .tv-peek {
            display: none;
          }
        }
        /*
         * The gauge slides only when the number it shows actually changed —
         * a transition on width, not a loop. This screen is on all day next to
         * people working; motion that repeats regardless of events stops being
         * information within an hour and becomes something to sit beside.
         * A card being finished is worth a movement. Nothing else is.
         */
        .tv-gauge {
          transition: width 900ms cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        /*
         * Only opacity and transform are animated — never width, left or
         * filter. This wall runs eight hours a day next to people, and a
         * per-frame relayout or a live blur is heat they would sit beside.
         */
        .tv-edge {
          animation: tvedge 3.2s ease-in-out infinite;
        }
        @keyframes tvedge {
          0%,
          100% {
            opacity: 0.45;
          }
          50% {
            opacity: 1;
          }
        }
        .tv-sweep {
          animation: tvsweep 6s ease-in-out infinite;
        }
        /*
         * The pulse runs up to the level and stops there — it never crosses
         * into the empty part of the cell, which would read as progress the
         * person has not made. 194% is the band's own width times the distance
         * that lands its right edge exactly on the fill's; the gauge also clips,
         * so the two agree even mid-transition when the width is still moving.
         */
        @keyframes tvsweep {
          0% {
            transform: translateX(-110%);
            opacity: 0;
          }
          8% {
            opacity: 1;
          }
          45% {
            transform: translateX(194%);
            opacity: 1;
          }
          56% {
            transform: translateX(194%);
            opacity: 0;
          }
          100% {
            transform: translateX(194%);
            opacity: 0;
          }
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
  freshFor,
}: {
  board: Board;
  freshFor: (publicId: string) => boolean;
}) {
  const { outcomes, people, cellOf, progressOf, progressOfPerson, hidden } =
    useMemo(
    () => buildMatrix(board),
    [board],
  );

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
        // min-content floor, 1fr ceiling: a row can never be shorter than the
        // cards in it (which is how a taller card used to get clipped), and any
        // space left over is still shared out so the grid fills the screen.
        gridTemplateRows: `auto repeat(${outcomes.length}, minmax(min-content, 1fr))`,
      }}
    >
      {/* header row */}
      <div className="flex items-center border-b-[0.16vw] border-light-500 bg-light-200 px-[1.1vw] py-[0.8vw]">
        <span className="text-[0.9vw] font-bold uppercase tracking-[0.18em] text-light-950">
          Key outcomes
        </span>
      </div>
      {people.map((p, i) => {
        const theirs = progressOfPerson(p.publicId);
        const colour = LANE_COLOURS[i % LANE_COLOURS.length]!;
        const pct = theirs.total
          ? Math.round((theirs.done / theirs.total) * 100)
          : 0;
        return (
          <div
            key={p.publicId}
            className="relative flex items-center gap-[0.6vw] overflow-hidden border-b-[0.16vw] border-light-500 border-l border-l-light-300 bg-light-50 px-[1vw] py-[0.8vw]"
          >
            {/*
             * The header fills like a gauge instead of carrying a bar under the
             * name: across a whole column the length is legible from the far
             * side of the room, where a 3px bar was not.
             *
             * It is tinted with the person's own colour rather than the
             * red/amber/green the outcomes use. Those thresholds say "this is
             * behind" — fair about a piece of work, unfair about a person, since
             * a card can be ten minutes or three days and this cannot tell them
             * apart. An identity colour says "this is zach's", which is all this
             * number should be claiming. Kept faint so it stays a background:
             * the outcomes are the goal, people are how it gets done, and the
             * hierarchy should not invert.
             */}
            <span
              aria-hidden
              className="tv-gauge absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: `${pct}%` }}
            >
              <span
                className="absolute inset-0"
                style={{ background: colour, opacity: 0.1 }}
              />
              {/*
               * A scanner pass, not a crawl: it crosses in three seconds and
               * then the cell is still for three. Something that never stops
               * moving stops being read within the hour, and this screen is on
               * beside people all day.
               */}
              <span
                className="tv-sweep absolute inset-y-0 left-0 w-[34%]"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colour}2E, transparent)`,
                }}
              />
              {/*
               * The water line, lit. On a light wall a glow cannot be additive
               * bloom — there is nothing to bloom against — so it is built the
               * way it actually reads here: one saturated hairline at the level,
               * with a halo bleeding back into the fill, breathing in intensity
               * rather than moving. Position stays put, so the number the gauge
               * reports never looks like it is drifting.
               */}
              <span
                className="tv-edge absolute inset-y-0 right-0 w-[2.4vw]"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colour}59)`,
                }}
              >
                <span
                  className="absolute inset-y-0 right-0 w-[0.16vw]"
                  style={{ background: colour }}
                />
              </span>
            </span>
            <span
              className="relative flex h-[2vw] w-[2vw] flex-none items-center justify-center rounded-full text-[0.95vw] font-extrabold text-white"
              style={{ background: colour }}
            >
              {initials(p.user?.name ?? p.email)}
            </span>
            <span className="relative truncate text-[1.5vw] font-bold tracking-[-0.02em]">
              {p.user?.name ?? p.email}
            </span>
            <span className="relative ml-auto flex flex-none items-baseline gap-[0.4vw]">
              <span
                className="text-[1.25vw] font-extrabold tabular-nums leading-none tracking-[-0.03em]"
                style={{ color: colour }}
              >
                {pct}%
              </span>
              {/* The count is what keeps this a report rather than a score. */}
              <span className="text-[0.8vw] font-bold tabular-nums text-light-900">
                {theirs.done}/{theirs.total}
              </span>
            </span>
          </div>
        );
      })}

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
      {/*
       * The label's own colourCode finally does something. It stopped colouring
       * the progress bar when that bar started reporting how far along an
       * outcome is — a colour cannot mean "which outcome" and "how far" at once.
       * As a spine it means identity again, which is what a label colour is for,
       * and it gives the eye a hard edge where one outcome ends and the next
       * begins.
       */}
      <div
        className="flex flex-col justify-center border-b-[0.12vw] border-light-600 bg-light-200 py-[0.8vw] pl-[1.1vw] pr-[1.1vw]"
        style={{
          borderLeft: `0.42vw solid ${outcome.colourCode ?? "#8A8A8A"}`,
        }}
      >
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
                // Was the label's own colour, which made three bars three
                // different colours for no reason — decoration on a screen that
                // uses colour to mean something. Now the bar reports how far
                // along this outcome actually is.
                background: progressColour(pct),
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
            // overflow is visible so the hover panel can escape the cell; the
            // rows are content-sized now, so there is nothing left to clip.
            className="flex min-h-0 flex-col gap-[0.42vw] border-b-[0.12vw] border-light-600 border-l border-l-light-300 p-[0.55vw]"
          >
            {items.slice(0, MAX_CARDS_PER_CELL).map((entry) => (
              <MatrixCard
                key={entry.card.publicId}
                entry={entry}
                fresh={freshFor(entry.card.publicId)}
              />
            ))}
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

/** Behind, moving, nearly there — so the bar says something colour can carry. */
function progressColour(pct: number) {
  if (pct >= 70) return "#1FAE6B";
  if (pct >= 30) return "#E58E14";
  return "#DC2626";
}

/**
 * One card in the matrix.
 *
 * Three readings of the same progress, aimed at three distances: the ring is
 * shape for someone walking past, the percentage and pips are precision for
 * someone standing at the board, and the hover panel is the full list for
 * someone who opened Showcase at their desk. The wall has no mouse, so nothing
 * that only appears on hover may be information the wall needs — the next step
 * is printed on the card for that reason.
 */
function MatrixCard({
  entry,
  fresh,
}: {
  entry: { card: Card; stage: string; isDone: boolean };
  fresh: boolean;
}) {
  const { card, stage, isDone } = entry;
  const blocked = isBlocked(card);
  const working = stage.toLowerCase().includes("working");
  const progress = checklistProgress(card);
  const step = nextStep(card);

  const colour = blocked
    ? "#DC2626"
    : isDone
      ? "#1FAE6B"
      : working
        ? "#2563EB"
        : "#E58E14";

  const pct = progress
    ? Math.round((progress.done / progress.total) * 100)
    : null;

  // The step only earns its line where it answers something: on a card being
  // worked, or a blocked one where the step is usually what is being waited on.
  // On a Next card "next step" just means "step one", and on a Done card there
  // is none.
  const showStep = !!step && (working || blocked);

  const due = card.dueDate ? new Date(card.dueDate) : null;
  const late = due && !isDone && isOverdue(due);

  return (
    <article
      className="tv-card relative rounded-[0.45vw] border bg-light-50 px-[0.62vw] py-[0.5vw]"
      style={
        // Blocked outranks everything else. It used to sit below `fresh`, so a
        // blocked card that had just moved lost its red for 90 seconds — the
        // loudest state hidden by the least important one. The left bar carries
        // further across a room than a tinted background does.
        blocked
          ? {
              borderColor: "#F1B4B4",
              background: "#FEF2F2",
              borderLeftColor: "#DC2626",
              borderLeftWidth: "0.34vw",
            }
          : fresh
            ? { borderColor: "#059669", background: "#F0FDF6" }
            : isDone
              ? { borderColor: "#E3E7EA", background: "#F4F7F5" }
              : working
                ? { borderColor: "#B9D2FA", background: "#EEF4FF" }
                : { borderColor: "#E3E7EA" }
      }
    >
      <div className="flex items-start gap-[0.55vw]">
        <StatusMark colour={colour} progress={progress} />
        <p
          className={`min-w-0 flex-1 text-[1.02vw] font-semibold leading-[1.26] text-light-1000 ${
            isDone ? "line-through opacity-60" : ""
          }`}
        >
          {card.title}
        </p>
        {pct !== null && (
          <span
            className="flex-none pt-[0.06vw] text-[0.95vw] font-extrabold tabular-nums leading-none tracking-[-0.02em]"
            style={{ color: colour }}
          >
            {pct}%
          </span>
        )}
      </div>

      {progress && (
        <div className="ml-[2.15vw] mt-[0.36vw] flex min-w-0 items-center gap-[0.5vw]">
          {progress.total <= MAX_PIPS && (
            <span className="flex flex-none gap-[0.18vw]">
              {Array.from({ length: progress.total }, (_, i) => (
                <span
                  key={i}
                  className="h-[0.52vw] w-[0.52vw] rounded-full"
                  style={
                    i < progress.done
                      ? { background: colour }
                      : i === progress.done
                        ? { background: "#FFFFFF", boxShadow: `inset 0 0 0 0.16vw ${colour}` }
                        : { background: "#D3D8DE" }
                  }
                />
              ))}
            </span>
          )}
          {showStep && (
            // Always one line. The wall repaints every 10s, and a title that
            // wraps would change the card's height — a layout that twitches
            // pulls the eye far harder than a truncated word costs.
            <span className="min-w-0 truncate text-[0.84vw] font-semibold text-light-950">
              <span className="mr-[0.2vw] font-bold" style={{ color: colour }}>
                &rsaquo;
              </span>
              {step}
            </span>
          )}
        </div>
      )}

      {due && (
        <p
          className={`ml-[2.15vw] mt-[0.3vw] text-[0.84vw] font-bold ${
            late ? "text-[#DC2626]" : "text-light-900"
          }`}
        >
          {formatDue(due)}
          {late && " \u00b7 overdue"}
        </p>
      )}

      {progress && (
        // Desk-only enrichment. Hidden on the wall by the :fullscreen rule in
        // the global stylesheet: a kiosk pointer parked over a card would
        // otherwise leave a panel hanging open all day.
        <div className="tv-peek absolute left-[0.8vw] top-[calc(100%+0.3vw)] z-20 w-[15vw] rounded-[0.4vw] border border-light-400 bg-light-50 p-[0.6vw] shadow-lg">
          <div className="mb-[0.4vw] flex justify-between border-b border-light-300 pb-[0.3vw] text-[0.62vw] font-bold uppercase tracking-[0.12em] text-light-900">
            <span>Checklist</span>
            <span className="tabular-nums">
              {progress.done} / {progress.total}
            </span>
          </div>
          {card.checklists.map((group) => (
            <div key={group.publicId}>
              {card.checklists.length > 1 && (
                <p className="mt-[0.35vw] text-[0.58vw] font-bold uppercase tracking-[0.1em] text-light-800">
                  {group.name}
                </p>
              )}
              {group.items.map((item) => (
                <p
                  key={item.publicId}
                  className={`flex gap-[0.35vw] py-[0.12vw] text-[0.76vw] leading-[1.35] ${
                    item.completed
                      ? "text-light-800 line-through"
                      : "font-semibold text-light-1000"
                  }`}
                >
                  <span className="flex-none" style={{ color: item.completed ? "#1FAE6B" : "#B4BBC4" }}>
                    {item.completed ? "\u2713" : "\u25a2"}
                  </span>
                  {item.title}
                </p>
              ))}
            </div>
          ))}
        </div>
      )}
    </article>
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

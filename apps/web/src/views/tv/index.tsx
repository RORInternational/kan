import { keepPreviousData } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "~/utils/api";

/** How often to pull fresh board data. */
const POLL_MS = 10_000;
/** How long a card stays highlighted after it appears or moves. */
const FRESH_MS = 90_000;
/**
 * Cards shown per lane before collapsing the rest into a "+N more" row.
 * Tuned for a 16:9 screen at the type sizes below — roughly what fits without
 * the last card being clipped halfway. Raise it if lanes look sparse.
 */
const MAX_CARDS_PER_LANE = 5;

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

  const lists = board?.lists ?? [];
  const doneListId = lists.length ? lists[lists.length - 1]?.publicId : undefined;

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

  const totals = useMemo(() => {
    const all = lists.flatMap((l) => l.cards);
    const done = doneListId
      ? (lists.find((l) => l.publicId === doneListId)?.cards.length ?? 0)
      : 0;
    return { all: all.length, done, open: all.length - done };
  }, [lists, doneListId]);

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

  return (
    <div className="tv-root flex h-screen w-screen flex-col overflow-hidden bg-light-100 text-light-1000">
      <header className="flex flex-none items-center justify-between border-b border-light-300 bg-light-50 px-[2.2vw] pb-[1.2vw] pt-[1.6vw]">
        <div className="flex items-baseline gap-[1.2vw]">
          <h1 className="text-[3.2vw] font-extrabold leading-none tracking-[-0.04em] text-light-1000">
            {board.name}
          </h1>
          <span className="text-[1.1vw] font-semibold uppercase tracking-[0.22em] text-light-900">
            {board.workspace.cardPrefix}
          </span>
        </div>
        <div className="flex items-center gap-[2vw]">
          <span className="flex items-center gap-[0.6vw] text-[1.1vw] font-bold tracking-[0.14em] text-emerald-700">
            <span className="tv-pulse h-[0.75vw] w-[0.75vw] rounded-full bg-emerald-600" />
            LIVE
          </span>
          <span className="text-[1.9vw] font-bold tabular-nums tracking-[-0.02em] text-light-1000">
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

      <div
        className="grid min-h-0 flex-1 gap-[1.3vw] px-[2.2vw] py-[1.6vw]"
        style={{
          gridTemplateColumns: `repeat(${Math.max(lists.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {lists.map((list, i) => {
          const accent = LANE_COLOURS[i % LANE_COLOURS.length] ?? "#2563EB";
          return (
            <section key={list.publicId} className="flex min-h-0 flex-col">
              <div className="mb-[1.1vw] flex flex-none items-center gap-[0.9vw]">
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
                className="mb-[1.1vw] h-[0.35vw] flex-none rounded-full"
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
                  const mark = seen.current.get(card.publicId);
                  // at === 0 marks a card that was already there on first load.
                  const fresh =
                    !!mark && mark.at > 0 && Date.now() - mark.at < FRESH_MS;
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

      <footer className="flex flex-none items-center justify-between border-t border-light-300 bg-light-50 px-[2.2vw] py-[0.9vw] text-[1.05vw] font-semibold text-light-950">
        <span>
          {totals.all} cards · {totals.open} not done · {totals.done} done
        </span>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-light-100">
      {children}
    </div>
  );
}

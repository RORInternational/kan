import { t } from "@lingui/core/macro";
import { useEffect, useMemo, useState } from "react";
import {
  HiMiniArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineInboxArrowDown,
  HiOutlinePlusSmall,
  HiOutlineSparkles,
  HiOutlineTrash,
  HiXMark,
} from "react-icons/hi2";

import { generateUID } from "@kan/shared/utils";

import type { OrganizedTask, TaskArea, TaskPriority } from "~/utils/task-dump";
import Button from "~/components/Button";
import { useModal } from "~/providers/modal";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  getPriorityLabelPublicIds,
  organizeTaskDump,
  suggestTaskList,
  taskPriorities,
} from "~/utils/task-dump";

interface BoardListOption {
  publicId: string;
  name: string;
}

interface BoardLabelOption {
  publicId: string;
  name: string;
}

interface DraftTask extends OrganizedTask {
  id: string;
}

interface DraftList {
  id: string;
  name: string;
  existingListPublicId?: string;
  tasks: DraftTask[];
}

interface StoredBoardTaskDump {
  input: string;
  lists: DraftList[];
}

const getPriorityName = (priority: TaskPriority): string => {
  if (priority === "high") return t`High`;
  if (priority === "medium") return t`Medium`;
  return t`Low`;
};

const getAreaName = (area: TaskArea): string => {
  if (area === "work") return t`Work`;
  if (area === "admin") return t`Admin`;
  if (area === "health") return t`Health`;
  if (area === "errands") return t`Errands`;
  if (area === "ideas") return t`Ideas`;
  return t`Personal`;
};

const priorityStyles: Record<TaskPriority, string> = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-sky-500",
};

const isStoredBoardTaskDump = (
  value: unknown,
): value is StoredBoardTaskDump => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredBoardTaskDump>;
  return typeof candidate.input === "string" && Array.isArray(candidate.lists);
};

const groupTasksIntoLists = (
  tasks: OrganizedTask[],
  existingLists: BoardListOption[],
  allowNewLists: boolean,
): DraftList[] => {
  const grouped = new Map<string, DraftList>();

  for (const task of tasks) {
    const suggestedDestination = suggestTaskList(task, existingLists);
    const suggestion =
      !allowNewLists && !suggestedDestination.existingListPublicId
        ? {
            name: existingLists[0]?.name ?? suggestedDestination.name,
            existingListPublicId: existingLists[0]?.publicId,
          }
        : suggestedDestination;
    const key = suggestion.existingListPublicId
      ? `existing-${suggestion.existingListPublicId}`
      : `suggested-${suggestion.name.toLocaleLowerCase()}`;
    const currentList = grouped.get(key) ?? {
      id: suggestion.existingListPublicId
        ? `existing-${suggestion.existingListPublicId}`
        : generateUID(),
      name: suggestion.name,
      existingListPublicId: suggestion.existingListPublicId,
      tasks: [],
    };

    currentList.tasks.push({ ...task, id: generateUID() });
    grouped.set(key, currentList);
  }

  return Array.from(grouped.values());
};

export function TaskDumpModal({
  boardPublicId,
  boardName,
  existingLists,
  labels,
  canCreateList,
}: {
  boardPublicId: string;
  boardName: string;
  existingLists: BoardListOption[];
  labels: BoardLabelOption[];
  canCreateList: boolean;
}) {
  const { closeModal } = useModal();
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const createList = api.list.create.useMutation();
  const createCard = api.card.create.useMutation();

  const [input, setInput] = useState("");
  const [draftLists, setDraftLists] = useState<DraftList[]>([]);
  const [isApplying, setIsApplying] = useState(false);
  const [loadedBoardPublicId, setLoadedBoardPublicId] = useState("");

  const storageKey = `kan_board-task-dump_${boardPublicId}`;
  const taskCount = useMemo(
    () => draftLists.reduce((count, list) => count + list.tasks.length, 0),
    [draftLists],
  );
  const newListCount = draftLists.filter(
    (list) => !list.existingListPublicId && list.tasks.length > 0,
  ).length;
  const destinationOptions = useMemo(
    () => [
      ...draftLists.map((list) => ({ id: list.id, name: list.name })),
      ...existingLists
        .filter(
          (existingList) =>
            !draftLists.some(
              (draftList) =>
                draftList.existingListPublicId === existingList.publicId,
            ),
        )
        .map((list) => ({
          id: `existing-${list.publicId}`,
          name: list.name,
        })),
    ],
    [draftLists, existingLists],
  );

  useEffect(() => {
    if (!boardPublicId) return;

    const storedValue = localStorage.getItem(storageKey);
    if (storedValue) {
      try {
        const parsedValue: unknown = JSON.parse(storedValue);
        if (isStoredBoardTaskDump(parsedValue)) {
          setInput(parsedValue.input);
          setDraftLists(parsedValue.lists);
          setLoadedBoardPublicId(boardPublicId);
          return;
        }
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    setInput("");
    setDraftLists([]);
    setLoadedBoardPublicId(boardPublicId);
  }, [boardPublicId, storageKey]);

  useEffect(() => {
    if (loadedBoardPublicId !== boardPublicId || !boardPublicId) return;
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        input,
        lists: draftLists,
      } satisfies StoredBoardTaskDump),
    );
  }, [boardPublicId, draftLists, input, loadedBoardPublicId, storageKey]);

  const handleOrganize = () => {
    const organizedTasks = organizeTaskDump(input);
    if (!organizedTasks.length) {
      showPopup({
        header: t`No tasks found`,
        message: t`Add a few actions, ideas, or reminders and try again.`,
        icon: "info",
      });
      return;
    }

    if (!canCreateList && !existingLists.length) {
      showPopup({
        header: t`A list is required`,
        message: t`You don’t have permission to create a list on this board.`,
        icon: "error",
      });
      return;
    }

    setDraftLists(
      groupTasksIntoLists(organizedTasks, existingLists, canCreateList),
    );
  };

  const updateTask = (listId: string, updatedTask: DraftTask) => {
    setDraftLists((currentLists) =>
      currentLists.map((list) =>
        list.id === listId
          ? {
              ...list,
              tasks: list.tasks.map((task) =>
                task.id === updatedTask.id ? updatedTask : task,
              ),
            }
          : list,
      ),
    );
  };

  const moveTask = (
    taskId: string,
    sourceListId: string,
    nextListId: string,
  ) => {
    if (sourceListId === nextListId) return;
    setDraftLists((currentLists) => {
      const task = currentLists
        .find((list) => list.id === sourceListId)
        ?.tasks.find((candidate) => candidate.id === taskId);
      if (!task) return currentLists;

      const existingDestination = existingLists.find(
        (list) => `existing-${list.publicId}` === nextListId,
      );
      const destinationIsInDraft = currentLists.some(
        (list) => list.id === nextListId,
      );

      const updatedLists = currentLists.map((list) => {
        if (list.id === sourceListId) {
          return {
            ...list,
            tasks: list.tasks.filter((candidate) => candidate.id !== taskId),
          };
        }
        if (list.id === nextListId) {
          return { ...list, tasks: [...list.tasks, task] };
        }
        return list;
      });

      if (existingDestination && !destinationIsInDraft) {
        updatedLists.push({
          id: nextListId,
          name: existingDestination.name,
          existingListPublicId: existingDestination.publicId,
          tasks: [task],
        });
      }

      return updatedLists;
    });
  };

  const removeTask = (listId: string, taskId: string) => {
    setDraftLists((currentLists) =>
      currentLists.map((list) =>
        list.id === listId
          ? {
              ...list,
              tasks: list.tasks.filter((task) => task.id !== taskId),
            }
          : list,
      ),
    );
  };

  const addSuggestedList = () => {
    setDraftLists((currentLists) => [
      ...currentLists,
      { id: generateUID(), name: t`New list`, tasks: [] },
    ]);
  };

  const addTask = (listId: string) => {
    setDraftLists((currentLists) =>
      currentLists.map((list) =>
        list.id === listId
          ? {
              ...list,
              tasks: [
                ...list.tasks,
                {
                  id: generateUID(),
                  title: t`New task`,
                  priority: "medium",
                  area: "personal",
                  reason: "manual",
                },
              ],
            }
          : list,
      ),
    );
  };

  const handleApply = async () => {
    const populatedLists = draftLists.filter((list) =>
      list.tasks.some((task) => task.title.trim().length > 0),
    );
    if (!populatedLists.length || isApplying) return;

    setIsApplying(true);
    const createdTaskIds = new Set<string>();
    const createdListIds = new Map<string, string>();

    try {
      for (const list of populatedLists) {
        let destinationListPublicId = list.existingListPublicId;

        if (!destinationListPublicId) {
          const created = await createList.mutateAsync({
            name: list.name.trim() || t`Tasks`,
            boardPublicId,
          });
          destinationListPublicId = created.publicId;
          createdListIds.set(list.id, created.publicId);
        }

        for (const task of list.tasks) {
          const title = task.title.trim();
          if (!title) continue;

          await createCard.mutateAsync({
            title,
            description: `<p><strong>${t`Priority`}:</strong> ${getPriorityName(task.priority)}</p><p><strong>${t`Area`}:</strong> ${getAreaName(task.area)}</p><p>${t`Captured from Task Dump.`}</p>`,
            listPublicId: destinationListPublicId,
            labelPublicIds: getPriorityLabelPublicIds(task.priority, labels),
            memberPublicIds: [],
            position: "end",
            dueDate: null,
          });
          createdTaskIds.add(task.id);
        }
      }

      localStorage.removeItem(storageKey);
      setInput("");
      setDraftLists([]);
      await utils.board.byId.invalidate();
      showPopup({
        header: t`Task dump added`,
        message: t`${createdTaskIds.size} tasks are now organized on ${boardName}.`,
        icon: "success",
      });
      closeModal();
    } catch {
      setDraftLists((currentLists) =>
        currentLists.map((list) => ({
          ...list,
          existingListPublicId:
            list.existingListPublicId ?? createdListIds.get(list.id),
          tasks: list.tasks.filter((task) => !createdTaskIds.has(task.id)),
        })),
      );
      await utils.board.byId.invalidate();
      showPopup({
        header: t`Some tasks could not be added`,
        message: t`The tasks that were not created are still in your draft. Please try again.`,
        icon: "error",
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="flex max-h-[86vh] min-h-[640px] flex-col overflow-hidden">
      <header className="flex items-start justify-between border-b border-light-400 px-6 py-5 dark:border-dark-400">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-light-1000 text-light-50 dark:bg-dark-1000 dark:text-dark-50">
            <HiOutlineInboxArrowDown className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-light-1000 dark:text-dark-1000">
              {t`Task dump`}
            </h2>
            <p className="mt-0.5 text-xs text-light-800 dark:text-dark-800">
              {draftLists.length
                ? t`Review the suggested lists, move anything, then add it to ${boardName}.`
                : t`Tell us everything on your mind. Your draft is saved automatically.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={closeModal}
          className="rounded-md p-1.5 text-light-800 hover:bg-light-200 hover:text-light-1000 dark:text-dark-800 dark:hover:bg-dark-300 dark:hover:text-dark-1000"
          aria-label={t`Close task dump`}
        >
          <HiXMark className="h-5 w-5" />
        </button>
      </header>

      {!draftLists.length ? (
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
          <section>
            <label
              htmlFor="board-task-dump"
              className="mb-2 block text-sm font-semibold text-light-1000 dark:text-dark-1000"
            >
              {t`What’s on your mind?`}
            </label>
            <textarea
              id="board-task-dump"
              autoFocus
              value={input}
              onChange={(event) => setInput(event.currentTarget.value)}
              placeholder={t`Write naturally or paste anything here…\n\nCall Alex about the launch timeline today. Book a dentist appointment. Research reporting tools someday. Prepare the client presentation for Friday.`}
              className="min-h-[430px] w-full resize-none rounded-xl border-0 bg-light-100 p-5 text-sm leading-6 text-light-1000 shadow-inner ring-1 ring-inset ring-light-400 placeholder:text-light-700 focus:ring-2 focus:ring-inset focus:ring-light-800 dark:bg-dark-100 dark:text-dark-1000 dark:ring-dark-500 dark:placeholder:text-dark-700"
            />
            <div className="mt-2 text-right text-xs text-light-700 dark:text-dark-700">
              {input.trim()
                ? t`${input.trim().split(/\s+/).length} words captured`
                : t`Add as much detail as you need`}
            </div>
          </section>

          <aside className="flex flex-col rounded-xl border border-light-300 bg-light-100 p-5 dark:border-dark-400 dark:bg-dark-100">
            <HiOutlineSparkles className="h-6 w-6 text-light-900 dark:text-dark-900" />
            <h3 className="mt-4 text-sm font-bold text-light-1000 dark:text-dark-1000">
              {t`What happens next`}
            </h3>
            <ol className="mt-4 space-y-4 text-xs leading-5 text-light-800 dark:text-dark-800">
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-light-300 font-bold text-light-1000 dark:bg-dark-300 dark:text-dark-1000">
                  1
                </span>
                {t`Your thoughts are separated into clear, editable tasks.`}
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-light-300 font-bold text-light-1000 dark:bg-dark-300 dark:text-dark-1000">
                  2
                </span>
                {t`We suggest existing or new lists for each task.`}
              </li>
              <li className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-light-300 font-bold text-light-1000 dark:bg-dark-300 dark:text-dark-1000">
                  3
                </span>
                {t`Nothing is added until you review and accept the plan.`}
              </li>
            </ol>
            <Button
              type="button"
              className="mt-auto"
              fullWidth
              disabled={!input.trim()}
              onClick={handleOrganize}
              iconLeft={<HiOutlineSparkles className="h-4 w-4" />}
              iconRight={<HiOutlineArrowRight className="h-4 w-4" />}
            >
              {t`Organize my tasks`}
            </Button>
          </aside>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 border-b border-light-300 px-6 py-3 dark:border-dark-300">
            <button
              type="button"
              onClick={() => setDraftLists([])}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-light-800 hover:text-light-1000 dark:text-dark-800 dark:hover:text-dark-1000"
            >
              <HiMiniArrowLeft className="h-4 w-4" />
              {t`Edit task dump`}
            </button>
            <div className="flex items-center gap-2 text-xs text-light-800 dark:text-dark-800">
              <span className="rounded-full bg-light-200 px-2.5 py-1 font-semibold dark:bg-dark-300">
                {t`${taskCount} tasks`}
              </span>
              <span className="rounded-full bg-light-200 px-2.5 py-1 font-semibold dark:bg-dark-300">
                {t`${newListCount} new lists`}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-light-100 p-5 dark:bg-dark-50">
            <div className="flex h-full min-w-max items-start gap-4">
              {draftLists.map((list) => (
                <section
                  key={list.id}
                  className="flex max-h-full w-[285px] flex-col rounded-xl border border-light-400 bg-light-50 shadow-sm dark:border-dark-400 dark:bg-dark-100"
                >
                  <div className="border-b border-light-300 px-3 py-3 dark:border-dark-300">
                    <div className="flex items-center gap-2">
                      {list.existingListPublicId ? (
                        <h3 className="min-w-0 flex-1 truncate text-sm font-bold text-light-1000 dark:text-dark-1000">
                          {list.name}
                        </h3>
                      ) : (
                        <input
                          value={list.name}
                          onChange={(event) =>
                            setDraftLists((currentLists) =>
                              currentLists.map((currentList) =>
                                currentList.id === list.id
                                  ? {
                                      ...currentList,
                                      name: event.currentTarget.value,
                                    }
                                  : currentList,
                              ),
                            )
                          }
                          aria-label={t`Suggested list name`}
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-bold text-light-1000 focus:ring-0 dark:text-dark-1000"
                        />
                      )}
                      <span className="shrink-0 rounded-full bg-light-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-light-800 dark:bg-dark-300 dark:text-dark-800">
                        {list.existingListPublicId ? t`Existing` : t`New list`}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-light-700 dark:text-dark-700">
                      {t`${list.tasks.length} tasks`}
                    </p>
                  </div>

                  <div className="min-h-[100px] flex-1 space-y-2 overflow-y-auto p-2">
                    {list.tasks.map((task) => (
                      <article
                        key={task.id}
                        className="rounded-lg border border-light-300 bg-white p-3 shadow-sm dark:border-dark-400 dark:bg-dark-200"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityStyles[task.priority]}`}
                          />
                          <input
                            value={task.title}
                            onChange={(event) =>
                              updateTask(list.id, {
                                ...task,
                                title: event.currentTarget.value,
                              })
                            }
                            aria-label={t`Task title`}
                            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-xs font-semibold leading-5 text-light-1000 focus:ring-0 dark:text-dark-1000"
                          />
                          <button
                            type="button"
                            onClick={() => removeTask(list.id, task.id)}
                            className="rounded p-0.5 text-light-700 hover:bg-light-200 hover:text-light-1000 dark:text-dark-700 dark:hover:bg-dark-300"
                            aria-label={t`Remove ${task.title}`}
                          >
                            <HiOutlineTrash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <label className="text-[10px] font-medium text-light-700 dark:text-dark-700">
                            <span className="mb-1 block">{t`Priority`}</span>
                            <select
                              value={task.priority}
                              onChange={(event) =>
                                updateTask(list.id, {
                                  ...task,
                                  priority: event.currentTarget
                                    .value as TaskPriority,
                                  reason: "manual",
                                })
                              }
                              className="w-full rounded border-0 bg-light-100 py-1 pl-2 pr-6 text-[11px] font-medium text-light-900 ring-1 ring-inset ring-light-300 focus:ring-light-700 dark:bg-dark-100 dark:text-dark-900 dark:ring-dark-400"
                            >
                              {taskPriorities.map((priority) => (
                                <option key={priority} value={priority}>
                                  {getPriorityName(priority)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-[10px] font-medium text-light-700 dark:text-dark-700">
                            <span className="mb-1 block">{t`Move to`}</span>
                            <select
                              value={list.id}
                              onChange={(event) =>
                                moveTask(
                                  task.id,
                                  list.id,
                                  event.currentTarget.value,
                                )
                              }
                              className="w-full rounded border-0 bg-light-100 py-1 pl-2 pr-6 text-[11px] font-medium text-light-900 ring-1 ring-inset ring-light-300 focus:ring-light-700 dark:bg-dark-100 dark:text-dark-900 dark:ring-dark-400"
                            >
                              {destinationOptions.map((destination) => (
                                <option
                                  key={destination.id}
                                  value={destination.id}
                                >
                                  {destination.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </article>
                    ))}
                    {!list.tasks.length && (
                      <div className="rounded-lg border border-dashed border-light-400 px-3 py-6 text-center text-xs text-light-700 dark:border-dark-500 dark:text-dark-700">
                        {t`Move tasks here or add one`}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => addTask(list.id)}
                    className="m-2 mt-0 inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 text-xs font-semibold text-light-800 hover:bg-light-200 hover:text-light-1000 dark:text-dark-800 dark:hover:bg-dark-300"
                  >
                    <HiOutlinePlusSmall className="h-4 w-4" />
                    {t`Add task`}
                  </button>
                </section>
              ))}

              {canCreateList && (
                <button
                  type="button"
                  onClick={addSuggestedList}
                  className="flex w-[220px] shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-light-500 px-4 py-4 text-sm font-semibold text-light-800 hover:border-light-700 hover:bg-light-200 hover:text-light-1000 dark:border-dark-500 dark:text-dark-800 dark:hover:border-dark-700 dark:hover:bg-dark-200"
                >
                  <HiOutlinePlusSmall className="h-5 w-5" />
                  {t`Add suggested list`}
                </button>
              )}
            </div>
          </div>

          <footer className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-light-400 px-6 py-4 dark:border-dark-400 sm:flex-row sm:items-center">
            <p className="text-xs text-light-700 dark:text-dark-700">
              {t`Existing lists stay unchanged. New lists and cards are only created after you confirm.`}
            </p>
            <Button
              type="button"
              onClick={handleApply}
              isLoading={isApplying}
              disabled={
                taskCount === 0 || draftLists.some((list) => !list.name.trim())
              }
              iconLeft={<HiOutlineCheckCircle className="h-4 w-4" />}
            >
              {t`Create ${taskCount} tasks`}
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}

import { describe, expect, it } from "vitest";

import {
  getPriorityLabelPublicIds,
  organizeTaskDump,
  suggestTaskList,
} from "./task-dump";

describe("organizeTaskDump", () => {
  it("extracts, cleans, and de-duplicates tasks", () => {
    const tasks = organizeTaskDump(`
      - I need to send the client report today.
      2. Book a dentist appointment tomorrow
      send the client report today
      Maybe explore a new note-taking tool.
    `);

    expect(tasks.map((task) => task.title)).toEqual([
      "send the client report today",
      "Book a dentist appointment tomorrow",
      "Maybe explore a new note-taking tool",
    ]);
  });

  it("assigns priorities and areas from natural language", () => {
    const tasks = organizeTaskDump(`
      Fix the critical client issue today
      Schedule a dentist appointment tomorrow
      Maybe research a new project idea someday
    `);

    expect(tasks).toMatchObject([
      { priority: "high", area: "work" },
      { priority: "medium", area: "health" },
      { priority: "low", area: "ideas" },
    ]);
  });
});

describe("suggestTaskList", () => {
  const lists = [
    { publicId: "abcdefghijkl", name: "Critical" },
    { publicId: "mnopqrstuvwx", name: "Work" },
  ];

  it("prefers an existing priority list for urgent tasks", () => {
    expect(
      suggestTaskList(
        {
          title: "Fix the urgent client issue today",
          priority: "high",
          area: "work",
          reason: "urgent",
        },
        lists,
      ),
    ).toEqual({ name: "Critical", existingListPublicId: "abcdefghijkl" });
  });

  it("prefers a matching existing area list", () => {
    expect(
      suggestTaskList(
        {
          title: "Review the quarterly project report",
          priority: "medium",
          area: "work",
          reason: "near-term",
        },
        lists,
      ),
    ).toEqual({ name: "Work", existingListPublicId: "mnopqrstuvwx" });
  });

  it("suggests a new area list when the board has no match", () => {
    expect(
      suggestTaskList(
        {
          title: "Book a dentist appointment",
          priority: "medium",
          area: "health",
          reason: "near-term",
        },
        lists,
      ),
    ).toEqual({ name: "Health" });
  });
});

describe("getPriorityLabelPublicIds", () => {
  it("matches an existing label without exposing internal IDs", () => {
    const labels = [
      { publicId: "abcdefghijkl", name: "Urgent" },
      { publicId: "mnopqrstuvwx", name: "Later" },
    ];

    expect(getPriorityLabelPublicIds("high", labels)).toEqual(["abcdefghijkl"]);
    expect(getPriorityLabelPublicIds("low", labels)).toEqual([]);
  });
});

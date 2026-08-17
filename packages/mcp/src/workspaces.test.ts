import { beforeEach, describe, expect, it, vi } from "vitest";

import { listWorkspaces, matchByName } from "./workspaces.js";

const kanRequest = vi.hoisted(() => vi.fn());
vi.mock("./client.js", () => ({ kanRequest }));

describe("listWorkspaces", () => {
  beforeEach(() => kanRequest.mockReset());

  it("unwraps the membership envelope the REST API actually returns", async () => {
    // GET /workspaces returns membership records, not workspaces. Reading
    // `.name` off the outer object is what produced "Cannot read properties of
    // undefined (reading 'toLowerCase')".
    kanRequest.mockResolvedValue([
      {
        role: "admin",
        workspace: { publicId: "ws1234567890", name: "ROR International" },
      },
    ]);

    await expect(listWorkspaces()).resolves.toEqual([
      { publicId: "ws1234567890", name: "ROR International" },
    ]);
  });

  it("accepts a flat shape too", async () => {
    kanRequest.mockResolvedValue([
      { publicId: "ws1234567890", name: "ROR International" },
    ]);

    await expect(listWorkspaces()).resolves.toEqual([
      { publicId: "ws1234567890", name: "ROR International" },
    ]);
  });

  it("drops malformed rows instead of throwing", async () => {
    kanRequest.mockResolvedValue([
      { role: "admin", workspace: { publicId: "ws1234567890" } },
      null,
      { publicId: "ws0987654321", name: "Valid" },
    ]);

    await expect(listWorkspaces()).resolves.toEqual([
      { publicId: "ws0987654321", name: "Valid" },
    ]);
  });

  it("returns empty when the response is not an array", async () => {
    kanRequest.mockResolvedValue({ error: "nope" });
    await expect(listWorkspaces()).resolves.toEqual([]);
  });
});

describe("matchByName", () => {
  const items = [{ name: "ROR International" }, { name: "gogogo" }];

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(matchByName(items, "ror international")).toEqual({
      name: "ROR International",
    });
    expect(matchByName(items, "  GoGoGo  ")).toEqual({ name: "gogogo" });
  });

  it("returns undefined when nothing matches", () => {
    expect(matchByName(items, "missing")).toBeUndefined();
  });
});

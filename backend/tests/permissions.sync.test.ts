import path from "node:path";
import { describe, expect, it } from "vitest";

import { PERMISSIONS as BACKEND_PERMISSIONS, ROLE_PERMISSIONS } from "../src/auth/permissions";
import { ROLES } from "../src/auth/types";

// Vitest transpiles TypeScript on demand, so the frontend mirror can be
// imported directly instead of being parsed out of source text.
const FRONTEND_MODULE = path.resolve(__dirname, "../../frontend/src/lib/permissions");

describe("permissions parity", () => {
  it("keeps the frontend mirror in sync with the backend map", async () => {
    const mirrored = (await import(FRONTEND_MODULE)) as {
      ROLE_PERMISSIONS: Record<string, string[]>;
      ROLES: readonly string[];
    };

    expect([...mirrored.ROLES].sort()).toEqual([...ROLES].sort());

    for (const role of ROLES) {
      const backend = [...ROLE_PERMISSIONS[role]].sort();
      const frontend = [...(mirrored.ROLE_PERMISSIONS[role] ?? [])].sort();
      expect(frontend, `${role} drifted`).toEqual(backend);
    }
  });

  it("covers every permission in the documented set", () => {
    const used = new Set(Object.values(ROLE_PERMISSIONS).flat());
    for (const permission of BACKEND_PERMISSIONS) {
      expect(used.has(permission), `${permission} is defined but unused`).toBe(true);
    }
  });
});

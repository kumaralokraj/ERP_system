import assert from "node:assert/strict";
import test from "node:test";

import { PERMISSIONS, PERMISSION_GROUPS, sanitizePermissions } from "../constants/permissions.js";
import { authorizeAnyPermission, authorizePermissions } from "../middleware/permissions.js";

const runMiddleware = (middleware, user) => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  middleware({ user }, response, () => {
    nextCalled = true;
  });

  return { nextCalled, response };
};

test("promotions permission is assignable and retained during sanitization", () => {
  const promotionsGroup = PERMISSION_GROUPS.find((group) => group.module === "Promotions");

  assert.ok(PERMISSIONS.includes("promotions.view"));
  assert.ok(promotionsGroup?.permissions.some((permission) => permission.key === "promotions.view"));
  assert.deepEqual(sanitizePermissions(["promotions.view", "invalid.permission"]), ["promotions.view"]);
});

test("promotion-only users pass promotion and shared result authorization", () => {
  const user = { role: "staff", permissions: ["promotions.view"] };
  const promotionAccess = runMiddleware(authorizePermissions("promotions.view"), user);
  const sharedResultAccess = runMiddleware(
    authorizeAnyPermission("classes.view", "promotions.view"),
    user
  );

  assert.equal(promotionAccess.nextCalled, true);
  assert.equal(sharedResultAccess.nextCalled, true);
});

test("classes-only users do not pass promotion authorization", () => {
  const { nextCalled, response } = runMiddleware(authorizePermissions("promotions.view"), {
    role: "staff",
    permissions: ["classes.view"],
  });

  assert.equal(nextCalled, false);
  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.body.requiredPermissions, ["promotions.view"]);
});

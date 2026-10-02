import test from "node:test";
import assert from "node:assert/strict";

import { MacKeychainPasswordStore } from "../src/keychain";

type Runner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

test("macOS keychain store uses the expected security commands", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const runner: Runner = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === "find-generic-password") {
      return { stdout: "secret\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  };

  const store = new MacKeychainPasswordStore("Service", "Account", runner, "darwin");

  await store.setPassword("secret");
  const password = await store.getPassword();
  await store.deletePassword();

  assert.equal(password, "secret");
  assert.deepEqual(calls[0], {
    command: "security",
    args: ["add-generic-password", "-U", "-s", "Service", "-a", "Account", "-w", "secret"]
  });
  assert.deepEqual(calls[1], {
    command: "security",
    args: ["find-generic-password", "-s", "Service", "-a", "Account", "-w"]
  });
  assert.deepEqual(calls[2], {
    command: "security",
    args: ["delete-generic-password", "-s", "Service", "-a", "Account"]
  });
});

test("missing keychain items return null instead of throwing", async () => {
  const runner: Runner = async () => {
    throw new Error("The specified item could not be found in the keychain.");
  };

  const store = new MacKeychainPasswordStore("Service", "Account", runner, "darwin");

  assert.equal(await store.getPassword(), null);
  await assert.doesNotReject(() => store.deletePassword());
});


test("keychain failures do not expose command arguments or upstream output", async () => {
  const password = "synthetic-regression-password";
  const upstreamDetails = `Command failed: security add-generic-password -w ${password}\nprivate upstream output`;
  const runner: Runner = async () => {
    throw new Error(upstreamDetails);
  };
  const store = new MacKeychainPasswordStore("Service", "Account", runner, "darwin");
  for (const [operation, expected] of [
    [() => store.setPassword(password), "Failed to store the password in macOS Keychain."],
    [() => store.getPassword(), "Failed to read the macOS Keychain item."],
    [() => store.deletePassword(), "Failed to delete the macOS Keychain item."]
  ] as const) {
    await assert.rejects(operation, (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, expected);
      assert.equal(error.message.includes(password), false);
      assert.equal(error.message.includes("private upstream output"), false);
      return true;
    });
  }
});

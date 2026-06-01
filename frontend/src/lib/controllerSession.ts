"use client";

import { FeeSource, ResponseCodes } from "@cartridge/controller";
import type { AccountInterface, AllowArray, Call, InvokeFunctionResponse, UniversalDetails } from "starknet";
import { SESSION_POLICIES } from "@/lib/sessionPolicies";

type ExecuteReply =
  | (InvokeFunctionResponse & { code?: string })
  | {
      code?: string;
      message?: string;
      error?: unknown;
    };

interface ControllerKeychain {
  execute(
    calls: Call[],
    abis?: unknown,
    transactionsDetail?: unknown,
    sync?: boolean,
    feeSource?: FeeSource,
    error?: unknown,
  ): Promise<ExecuteReply>;
}

interface ControllerProviderWithSession {
  id?: string;
  keychain?: ControllerKeychain;
  updateSession?: (options: { policies: typeof SESSION_POLICIES }) => Promise<unknown>;
}

function toArray(calls: AllowArray<Call>): Call[] {
  return Array.isArray(calls) ? calls : [calls];
}

function getControllerProvider(account: AccountInterface): ControllerProviderWithSession | null {
  const walletProvider = (account as unknown as { walletProvider?: ControllerProviderWithSession }).walletProvider;
  if (walletProvider?.id !== "controller") return null;
  return walletProvider;
}

function throwSessionError(reply: ExecuteReply): never {
  const err = "error" in reply ? reply.error : undefined;
  if (err) throw err;
  const message =
    "message" in reply && reply.message
      ? reply.message
      : `Controller session execution failed (${reply.code ?? "unknown"})`;
  throw new Error(message);
}

async function executeSessionOnly(controller: ControllerProviderWithSession, calls: Call[]): Promise<ExecuteReply> {
  if (!controller.keychain) throw new Error("Controller keychain is not ready");
  return controller.keychain.execute(calls, undefined, undefined, false, FeeSource.PAYMASTER);
}

export async function executeControllerPaymaster(
  account: AccountInterface,
  calls: AllowArray<Call>,
  details?: UniversalDetails,
): Promise<InvokeFunctionResponse> {
  const controller = getControllerProvider(account);
  if (!controller) return account.execute(calls, details);

  const callArray = toArray(calls);
  let reply = await executeSessionOnly(controller, callArray);
  if (reply.code === ResponseCodes.SUCCESS || "transaction_hash" in reply) {
    return reply as InvokeFunctionResponse;
  }

  if (reply.code === ResponseCodes.USER_INTERACTION_REQUIRED) {
    await controller.updateSession?.({ policies: SESSION_POLICIES });
    reply = await executeSessionOnly(controller, callArray);

    if (reply.code === ResponseCodes.SUCCESS || "transaction_hash" in reply) {
      return reply as InvokeFunctionResponse;
    }
    if (reply.code === ResponseCodes.USER_INTERACTION_REQUIRED) {
      throw new Error(
        "Controller session is not approved for the ranked match call set. Approve the updated Cartridge session and try again; no transaction was submitted.",
      );
    }
  }

  throwSessionError(reply);
}

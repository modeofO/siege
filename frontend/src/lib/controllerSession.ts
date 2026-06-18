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

function isPaymasterInfraError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? e.message
      : e && typeof e === "object" && "message" in e
        ? String((e as { message: unknown }).message)
        : "";
  return msg.includes("AVNU sponsorship failed") || msg.includes("paymaster");
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

function isSuccess(reply: ExecuteReply): reply is InvokeFunctionResponse & { code?: string } {
  return reply.code === ResponseCodes.SUCCESS || "transaction_hash" in reply;
}

async function keychainExecute(
  controller: ControllerProviderWithSession,
  calls: Call[],
  feeSource: FeeSource,
): Promise<ExecuteReply> {
  if (!controller.keychain) throw new Error("Controller keychain is not ready");
  return controller.keychain.execute(calls, undefined, undefined, false, feeSource);
}

async function executeWithSession(
  controller: ControllerProviderWithSession,
  calls: Call[],
  feeSource: FeeSource,
): Promise<InvokeFunctionResponse> {
  let reply = await keychainExecute(controller, calls, feeSource);
  if (isSuccess(reply)) return reply as InvokeFunctionResponse;

  if (reply.code === ResponseCodes.USER_INTERACTION_REQUIRED) {
    await controller.updateSession?.({ policies: SESSION_POLICIES });
    reply = await keychainExecute(controller, calls, feeSource);
    if (isSuccess(reply)) return reply as InvokeFunctionResponse;
    if (reply.code === ResponseCodes.USER_INTERACTION_REQUIRED) {
      throw new Error(
        "Controller session is not approved for the ranked match call set. Approve the updated Cartridge session and try again; no transaction was submitted.",
      );
    }
  }

  throwSessionError(reply);
}

export async function executeControllerPaymaster(
  account: AccountInterface,
  calls: AllowArray<Call>,
  details?: UniversalDetails,
): Promise<InvokeFunctionResponse> {
  const controller = getControllerProvider(account);
  if (!controller) return account.execute(calls, details);

  const callArray = toArray(calls);
  try {
    return await executeWithSession(controller, callArray, FeeSource.PAYMASTER);
  } catch (e) {
    if (!isPaymasterInfraError(e)) throw e;
    console.warn("[siege] Paymaster unavailable, retrying with CREDITS:", e);
    return executeWithSession(controller, callArray, FeeSource.CREDITS);
  }
}

export async function resilientExecute(
  account: AccountInterface,
  calls: AllowArray<Call>,
  details?: UniversalDetails,
): Promise<InvokeFunctionResponse> {
  const controller = getControllerProvider(account);

  if (controller) {
    const callArray = toArray(calls);
    try {
      return await executeWithSession(controller, callArray, FeeSource.PAYMASTER);
    } catch (e) {
      if (!isPaymasterInfraError(e)) throw e;
      console.warn("[siege] Paymaster unavailable, retrying with CREDITS:", e);
      return executeWithSession(controller, callArray, FeeSource.CREDITS);
    }
  }

  return account.execute(calls, details);
}

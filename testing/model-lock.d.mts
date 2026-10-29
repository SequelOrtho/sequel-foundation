export { collectSourceFiles } from "./scrollers.mjs";
import type { SourceFile } from "./scrollers.mjs";

export interface UnlockedModelCall {
    path: string;
    /** 1-based line of the SDK call. */
    line: number;
    /** The call as written, whitespace removed (`messages.create(`). */
    call: string;
    /**
     * `outside-lock`: not inside a `withModelFallback(` callback.
     * `model-not-from-lock`: inside one, but its `model` is not the callback's parameter.
     */
    reason: "outside-lock" | "model-not-from-lock";
}
export interface ModelLockOptions {
    /**
     * `path` or `path:line` keys accepted for now, each with the reason. A
     * reason is required so an exception is a decision someone wrote down.
     */
    allow?: Record<string, string>;
}
/**
 * Every Anthropic SDK request (`messages.create` / `.parse` / `.stream` /
 * `.batches.create`) in `files` the model lock cannot vouch for (AI-CRAFT §1
 * "Model selection"). In a hub's vitest suite:
 *
 *   const files = collectSourceFiles(process.cwd(), ["app", "lib", "scripts", "netlify"]);
 *   const hits = findUnlockedModelCalls(files);
 *   expect(hits, formatUnlockedModelCalls(hits)).toEqual([]);
 */
export declare function findUnlockedModelCalls(files: readonly SourceFile[], options?: ModelLockOptions): UnlockedModelCall[];
/** A readable report: one line per hit, with the fix. */
export declare function formatUnlockedModelCalls(hits: readonly UnlockedModelCall[]): string;

import type { SourceFile } from "./scrollers.mjs";

/**
 * Every source file under `dirs` (relative to `root`), skipping
 * node_modules, `.next`, dot folders and `.d.ts` / `.d.mts` / `.d.cts`
 * files. Takes `.mts` / `.cts` / `.cjs` too, so Netlify functions are
 * scanned; a listed folder that doesn't exist is skipped, not an error.
 */
export declare function collectSourceFiles(root: string, dirs: readonly string[], extensions?: readonly string[]): SourceFile[];

export interface UnlockedModelCall {
    path: string;
    /** 1-based line of the SDK call. */
    line: number;
    /** The call as written, whitespace removed (`messages.create(`). */
    call: string;
    /**
     * `outside-lock`: not inside a `withModelFallback(` (or declared
     * wrapper) callback, or an SDK method taken by reference / destructured.
     * `model-not-from-lock`: inside one, but its `model` is not the
     * callback's parameter, or a later spread, a second `model` key, a
     * computed key or a reassignment of the parameter could replace it.
     * `wrapper-not-locked`: a `lockWrappers` name no scanned file defines
     * that hands its callback to `withModelFallback(primary, call)`.
     */
    reason: "outside-lock" | "model-not-from-lock" | "wrapper-not-locked";
}
export interface ModelLockOptions {
    /**
     * `path` or `path:line` keys accepted for now, each with the reason. A
     * reason is required so an exception is a decision someone wrote down.
     */
    allow?: Record<string, string>;
    /**
     * The hub's own wrappers that hand their callback to withModelFallback
     * (`tracedModelCall(name, primary, (model) => …)`). A call inside one
     * counts as inside the lock once the scan finds the wrapper's definition
     * among `files` handing its own (last) callback parameter to
     * withModelFallback: `withModelFallback(primary, call)`.
     */
    lockWrappers?: readonly string[];
}
/**
 * Every Anthropic SDK request (`messages.create` / `.parse` / `.stream` /
 * `.toolRunner` / `.batches.create`) in `files` the model lock cannot vouch
 * for (AI-CRAFT §1 "Model selection"). In a hub's vitest suite:
 *
 *   const files = collectSourceFiles(process.cwd(), ["app", "lib", "scripts", "netlify"]);
 *   const hits = findUnlockedModelCalls(files, { lockWrappers: ["tracedModelCall"] });
 *   expect(hits, formatUnlockedModelCalls(hits)).toEqual([]);
 */
export declare function findUnlockedModelCalls(files: readonly SourceFile[], options?: ModelLockOptions): UnlockedModelCall[];
/** A readable report: one line per hit, with the fix. */
export declare function formatUnlockedModelCalls(hits: readonly UnlockedModelCall[]): string;

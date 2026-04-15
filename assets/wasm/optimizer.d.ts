/* tslint:disable */
/* eslint-disable */

export function best_under_target(bytes: Uint32Array, scores: Float64Array, target: number): number;

export function encode_jpeg_rgba(rgba: Uint8Array, width: number, height: number, quality: number, subsampling: string, progressive: boolean): Uint8Array;

export function encode_png_lossless_best(rgba: Uint8Array, width: number, height: number, effort: number): Uint8Array;

export function encode_png_lossy_candidate(rgba: Uint8Array, width: number, height: number, palette_size: number, posterize_bits: number, dither_amount: number, alpha_protection: number, effort: number): Uint8Array;

export function encode_webp_rgba(rgba: Uint8Array, width: number, height: number, quality: number, effort: number, lossless: boolean): Uint8Array;

export function local_quality_window(best_quality: number, radius: number): any;

export function make_candidate_result(bytes_len: number, score: number, format_kind: number, width: number, height: number): any;

export function pareto_front_indices(bytes: Uint32Array, scores: Float64Array): Uint32Array;

export function score_image(original_rgba: Uint8Array, candidate_rgba: Uint8Array, width: number, height: number, has_alpha: boolean): any;

export function should_early_stop(target_bytes: number, candidate_bytes: number, previous_best_score: number, current_best_score: number): boolean;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly best_under_target: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly encode_jpeg_rgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly encode_png_lossless_best: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly encode_png_lossy_candidate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly encode_webp_rgba: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly local_quality_window: (a: number, b: number) => [number, number, number];
    readonly make_candidate_result: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly pareto_front_indices: (a: number, b: number, c: number, d: number) => [number, number];
    readonly score_image: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly should_early_stop: (a: number, b: number, c: number, d: number) => number;
    readonly start: () => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

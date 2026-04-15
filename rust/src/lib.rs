mod jpeg;
mod pareto;
mod png;
mod rgba;
mod score;
mod search;
mod types;
mod webp;

use png::{LosslessPngConfig, LossyPngConfig};
use serde::Serialize;
use wasm_bindgen::prelude::*;

use crate::types::{CandidateResult, ScoreResult};

fn to_js_error(message: impl ToString) -> JsValue {
    JsValue::from_str(&message.to_string())
}

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(value).map_err(to_js_error)
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

#[wasm_bindgen]
pub fn score_image(
    original_rgba: &[u8],
    candidate_rgba: &[u8],
    width: u32,
    height: u32,
    has_alpha: bool,
) -> Result<JsValue, JsValue> {
    let result: ScoreResult = score::score_rgba(
        original_rgba,
        candidate_rgba,
        width as usize,
        height as usize,
        has_alpha,
    );
    to_js_value(&result)
}

#[wasm_bindgen]
pub fn pareto_front_indices(bytes: Vec<u32>, scores: Vec<f64>) -> Vec<u32> {
    pareto::pareto_front_indices(&bytes, &scores)
}

#[wasm_bindgen]
pub fn best_under_target(bytes: Vec<u32>, scores: Vec<f64>, target: u32) -> i32 {
    pareto::best_under_target(&bytes, &scores, target)
}

#[wasm_bindgen]
pub fn should_early_stop(
    target_bytes: usize,
    candidate_bytes: usize,
    previous_best_score: f64,
    current_best_score: f64,
) -> bool {
    search::should_early_stop(
        target_bytes,
        candidate_bytes,
        previous_best_score,
        current_best_score,
    )
}

#[wasm_bindgen]
pub fn local_quality_window(best_quality: u8, radius: u8) -> Result<JsValue, JsValue> {
    to_js_value(&search::local_quality_window(best_quality, radius))
}

#[wasm_bindgen]
pub fn make_candidate_result(
    bytes_len: usize,
    score: f64,
    format_kind: u32,
    width: u32,
    height: u32,
) -> Result<JsValue, JsValue> {
    let result = CandidateResult {
        bytes_len,
        score,
        format_kind,
        width,
        height,
    };
    to_js_value(&result)
}

#[wasm_bindgen]
pub fn encode_jpeg_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    quality: u8,
    subsampling: &str,
    progressive: bool,
) -> Result<Vec<u8>, JsValue> {
    jpeg::encode_jpeg_rgba(rgba, width, height, quality, subsampling, progressive)
        .map_err(to_js_error)
}

#[wasm_bindgen]
pub fn encode_webp_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    quality: u8,
    effort: u8,
    lossless: bool,
) -> Result<Vec<u8>, JsValue> {
    webp::encode_webp_rgba(rgba, width, height, quality, effort, lossless).map_err(to_js_error)
}

#[wasm_bindgen]
pub fn encode_png_lossless_best(
    rgba: &[u8],
    width: u32,
    height: u32,
    effort: u8,
) -> Result<Vec<u8>, JsValue> {
    png::encode_png_lossless_best(rgba, width, height, LosslessPngConfig { effort }).map_err(to_js_error)
}

#[wasm_bindgen]
pub fn encode_png_lossy_candidate(
    rgba: &[u8],
    width: u32,
    height: u32,
    palette_size: u16,
    posterize_bits: u8,
    dither_amount: f32,
    alpha_protection: f32,
    effort: u8,
) -> Result<Vec<u8>, JsValue> {
    png::encode_png_lossy_candidate(
        rgba,
        width,
        height,
        LossyPngConfig {
            palette_size,
            posterize_bits,
            dither_amount,
            alpha_protection,
            effort,
        },
    )
    .map_err(to_js_error)
}

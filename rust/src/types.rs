use serde::{Deserialize, Serialize};

#[allow(dead_code)]
pub const FORMAT_KIND_PNG: u32 = 1;
#[allow(dead_code)]
pub const FORMAT_KIND_JPEG: u32 = 2;
#[allow(dead_code)]
pub const FORMAT_KIND_WEBP: u32 = 3;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CandidateResult {
    pub bytes_len: usize,
    pub score: f64,
    pub format_kind: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct ScoreResult {
    pub score: f64,
    pub mse: f64,
    pub psnr: f64,
    pub ssim: f64,
    pub alpha_delta: f64,
}

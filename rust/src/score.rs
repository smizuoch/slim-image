use crate::rgba::{composite_rgba_over_bg, BackgroundMode};
use crate::types::ScoreResult;

const SSIM_C1: f64 = (0.01 * 255.0) * (0.01 * 255.0);
const SSIM_C2: f64 = (0.03 * 255.0) * (0.03 * 255.0);

pub fn score_rgba(
    original: &[u8],
    candidate: &[u8],
    width: usize,
    height: usize,
    has_alpha: bool,
) -> ScoreResult {
    let mse = compute_mse(original, candidate);
    let psnr = compute_psnr(mse);
    if !has_alpha {
        let ssim = compute_ssim_rgb(original, candidate, width, height);
        let normalized_mse = mse / (255.0 * 255.0);
        let score = 0.82 * ssim - 0.18 * normalized_mse;
        return ScoreResult {
            score,
            mse,
            psnr,
            ssim,
            alpha_delta: 0.0,
        };
    }

    let mut ssim_total = 0.0;
    for mode in BackgroundMode::all() {
        let original_rgb = composite_rgba_over_bg(original, width, height, mode);
        let candidate_rgb = composite_rgba_over_bg(candidate, width, height, mode);
        ssim_total += compute_ssim_rgb_triplets(&original_rgb, &candidate_rgb);
    }
    let ssim = ssim_total / 4.0;
    let normalized_mse = mse / (255.0 * 255.0);
    let alpha_delta = compute_alpha_delta(original, candidate);
    let score = 0.76 * ssim - 0.14 * normalized_mse - 0.10 * alpha_delta;

    ScoreResult {
        score,
        mse,
        psnr,
        ssim,
        alpha_delta,
    }
}

pub fn compute_mse(original: &[u8], candidate: &[u8]) -> f64 {
    let mut error = 0.0;
    let mut count = 0.0;
    for (lhs, rhs) in original.chunks_exact(4).zip(candidate.chunks_exact(4)) {
        let channels = [
            (lhs[0] as f64, rhs[0] as f64),
            (lhs[1] as f64, rhs[1] as f64),
            (lhs[2] as f64, rhs[2] as f64),
        ];
        for (a, b) in channels {
            let delta = a - b;
            error += delta * delta;
            count += 1.0;
        }
    }
    if count == 0.0 {
        0.0
    } else {
        error / count
    }
}

pub fn compute_psnr(mse: f64) -> f64 {
    if mse <= f64::EPSILON {
        return 99.0;
    }
    10.0 * ((255.0 * 255.0) / mse).log10()
}

fn compute_alpha_delta(original: &[u8], candidate: &[u8]) -> f64 {
    let mut total = 0.0;
    let mut count = 0.0;
    for (lhs, rhs) in original.chunks_exact(4).zip(candidate.chunks_exact(4)) {
        total += ((lhs[3] as f64 - rhs[3] as f64).abs()) / 255.0;
        count += 1.0;
    }
    if count == 0.0 {
        0.0
    } else {
        total / count
    }
}

fn compute_ssim_rgb(original: &[u8], candidate: &[u8], _width: usize, _height: usize) -> f64 {
    let mut lhs = Vec::with_capacity(original.len() / 4);
    let mut rhs = Vec::with_capacity(candidate.len() / 4);
    for (lhs_px, rhs_px) in original.chunks_exact(4).zip(candidate.chunks_exact(4)) {
        lhs.push(rgb_to_luma(lhs_px[0], lhs_px[1], lhs_px[2]));
        rhs.push(rgb_to_luma(rhs_px[0], rhs_px[1], rhs_px[2]));
    }
    compute_ssim_gray(&lhs, &rhs)
}

fn compute_ssim_rgb_triplets(original_rgb: &[u8], candidate_rgb: &[u8]) -> f64 {
    let lhs = original_rgb
        .chunks_exact(3)
        .map(|px| rgb_to_luma(px[0], px[1], px[2]))
        .collect::<Vec<_>>();
    let rhs = candidate_rgb
        .chunks_exact(3)
        .map(|px| rgb_to_luma(px[0], px[1], px[2]))
        .collect::<Vec<_>>();
    compute_ssim_gray(&lhs, &rhs)
}

fn rgb_to_luma(r: u8, g: u8, b: u8) -> f64 {
    0.2126 * r as f64 + 0.7152 * g as f64 + 0.0722 * b as f64
}

fn compute_ssim_gray(lhs: &[f64], rhs: &[f64]) -> f64 {
    if lhs.is_empty() || rhs.is_empty() || lhs.len() != rhs.len() {
        return 0.0;
    }

    let stride = ((lhs.len() as f64 / 200_000.0).sqrt().floor() as usize).max(1);
    let sampled_lhs = lhs.iter().step_by(stride).copied().collect::<Vec<_>>();
    let sampled_rhs = rhs.iter().step_by(stride).copied().collect::<Vec<_>>();
    let n = sampled_lhs.len() as f64;
    let mean_x = sampled_lhs.iter().sum::<f64>() / n;
    let mean_y = sampled_rhs.iter().sum::<f64>() / n;
    let mut variance_x = 0.0;
    let mut variance_y = 0.0;
    let mut covariance = 0.0;

    for (x, y) in sampled_lhs.iter().zip(sampled_rhs.iter()) {
        let dx = x - mean_x;
        let dy = y - mean_y;
        variance_x += dx * dx;
        variance_y += dy * dy;
        covariance += dx * dy;
    }

    let denom = (n - 1.0).max(1.0);
    variance_x /= denom;
    variance_y /= denom;
    covariance /= denom;

    let numerator = (2.0 * mean_x * mean_y + SSIM_C1) * (2.0 * covariance + SSIM_C2);
    let denominator =
        (mean_x * mean_x + mean_y * mean_y + SSIM_C1) * (variance_x + variance_y + SSIM_C2);
    (numerator / denominator).clamp(-1.0, 1.0)
}

#[cfg(test)]
mod tests {
    use approx::assert_relative_eq;

    use super::{compute_mse, compute_psnr, score_rgba};

    #[test]
    fn mse_is_zero_for_identical() {
        let rgba = vec![10, 20, 30, 255, 40, 50, 60, 255];
        assert_relative_eq!(compute_mse(&rgba, &rgba), 0.0);
    }

    #[test]
    fn psnr_caps_for_identical() {
        assert_relative_eq!(compute_psnr(0.0), 99.0);
    }

    #[test]
    fn alpha_aware_score_penalizes_alpha_shift() {
        let original = vec![255, 0, 0, 255, 0, 255, 0, 255];
        let candidate = vec![255, 0, 0, 128, 0, 255, 0, 128];
        let score = score_rgba(&original, &candidate, 2, 1, true);
        assert!(score.alpha_delta > 0.4);
        assert!(score.score < 0.9);
    }
}

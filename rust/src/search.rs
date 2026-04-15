pub fn should_early_stop(
    target_bytes: usize,
    candidate_bytes: usize,
    previous_best_score: f64,
    current_best_score: f64,
) -> bool {
    if target_bytes == 0 {
        return false;
    }
    let fill_rate = candidate_bytes as f64 / target_bytes as f64;
    fill_rate >= 0.97 && (current_best_score - previous_best_score).abs() <= 0.0025
}

pub fn local_quality_window(best_quality: u8, radius: u8) -> (u8, u8) {
    let start = best_quality.saturating_sub(radius);
    let end = best_quality.saturating_add(radius).min(100);
    (start.max(1), end.max(1))
}

#[cfg(test)]
mod tests {
    use super::{local_quality_window, should_early_stop};

    #[test]
    fn decides_early_stop() {
        assert!(should_early_stop(1000, 980, 0.91, 0.912));
    }

    #[test]
    fn clamps_quality_window() {
        assert_eq!(local_quality_window(3, 5), (1, 8));
    }
}

pub fn pareto_front_indices(bytes: &[u32], scores: &[f64]) -> Vec<u32> {
    let mut pairs = bytes
        .iter()
        .copied()
        .zip(scores.iter().copied())
        .enumerate()
        .map(|(index, (bytes_len, score))| (index as u32, bytes_len, score))
        .collect::<Vec<_>>();

    pairs.sort_by(|lhs, rhs| lhs.1.cmp(&rhs.1).then_with(|| rhs.2.total_cmp(&lhs.2)));

    let mut best_score = f64::NEG_INFINITY;
    let mut front = Vec::new();
    for (index, _bytes_len, score) in pairs {
        if score > best_score {
            best_score = score;
            front.push(index);
        }
    }
    front
}

pub fn best_under_target(bytes: &[u32], scores: &[f64], target: u32) -> i32 {
    let mut best_index = -1_i32;
    let mut best_score = f64::NEG_INFINITY;
    let mut best_size = 0_u32;
    for (index, (bytes_len, score)) in bytes.iter().zip(scores.iter()).enumerate() {
        if *bytes_len > target {
            continue;
        }
        if *score > best_score || (*score == best_score && *bytes_len > best_size) {
            best_score = *score;
            best_size = *bytes_len;
            best_index = index as i32;
        }
    }
    best_index
}

#[cfg(test)]
mod tests {
    use super::{best_under_target, pareto_front_indices};

    #[test]
    fn builds_pareto_front() {
        let bytes = vec![100, 120, 130, 140];
        let scores = vec![0.5, 0.7, 0.65, 0.9];
        let front = pareto_front_indices(&bytes, &scores);
        assert_eq!(front, vec![0, 1, 3]);
    }

    #[test]
    fn picks_best_under_target() {
        let bytes = vec![100, 120, 130];
        let scores = vec![0.5, 0.8, 0.9];
        assert_eq!(best_under_target(&bytes, &scores, 125), 1);
    }
}

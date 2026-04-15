use std::collections::HashMap;
use std::io::Cursor;

use png::{BitDepth, ColorType, Compression, Encoder, Filter};

use crate::rgba::normalize_transparent_pixels;

#[derive(Clone, Copy, Debug)]
pub struct LosslessPngConfig {
    pub effort: u8,
}

#[derive(Clone, Copy, Debug)]
pub struct LossyPngConfig {
    pub palette_size: u16,
    pub posterize_bits: u8,
    pub dither_amount: f32,
    pub alpha_protection: f32,
    pub effort: u8,
}

#[derive(Clone, Debug)]
struct PaletteEntry {
    rgba: [u8; 4],
    count: u32,
}

#[derive(Clone, Copy, Debug)]
enum PngRepresentation {
    Rgba,
    Rgb,
    Grayscale,
    GrayscaleAlpha,
    Indexed,
}

pub fn encode_png_lossless_best(
    rgba: &[u8],
    width: u32,
    height: u32,
    config: LosslessPngConfig,
) -> Result<Vec<u8>, String> {
    let mut normalized = rgba.to_vec();
    normalize_transparent_pixels(&mut normalized);
    let representations = build_lossless_representations(&normalized, config.effort);
    let mut best: Option<Vec<u8>> = None;

    for representation in representations {
        let encoded = encode_representation(&normalized, width, height, representation, config.effort)?;
        if best
            .as_ref()
            .map(|current| encoded.len() < current.len())
            .unwrap_or(true)
        {
            best = Some(encoded);
        }
    }

    best.ok_or_else(|| "PNG lossless candidate generation failed".to_string())
}

pub fn encode_png_lossy_candidate(
    rgba: &[u8],
    width: u32,
    height: u32,
    config: LossyPngConfig,
) -> Result<Vec<u8>, String> {
    let mut prepared = quantize_rgba(rgba, width as usize, height as usize, config);
    normalize_transparent_pixels(&mut prepared);
    let exact_palette = build_exact_palette(&prepared, config.palette_size as usize);
    let representation = if let Some((_, palette_len)) = exact_palette.as_ref() {
        let _ = palette_len;
        PngRepresentation::Indexed
    } else {
        PngRepresentation::Rgba
    };
    encode_representation(&prepared, width, height, representation, config.effort)
}

fn build_lossless_representations(rgba: &[u8], effort: u8) -> Vec<PngRepresentation> {
    let mut representations = vec![PngRepresentation::Rgba];
    let opaque = rgba.chunks_exact(4).all(|pixel| pixel[3] == 255);
    let grayscale = rgba
        .chunks_exact(4)
        .all(|pixel| pixel[0] == pixel[1] && pixel[1] == pixel[2]);

    if opaque {
        representations.push(PngRepresentation::Rgb);
    }
    if grayscale && opaque {
        representations.push(PngRepresentation::Grayscale);
    } else if grayscale {
        representations.push(PngRepresentation::GrayscaleAlpha);
    }

    if effort >= 2 {
        if let Some((_, palette_len)) = build_exact_palette(rgba, 256) {
            let _ = palette_len;
            representations.push(PngRepresentation::Indexed);
        }
    }

    representations
}

fn encode_representation(
    rgba: &[u8],
    width: u32,
    height: u32,
    representation: PngRepresentation,
    effort: u8,
) -> Result<Vec<u8>, String> {
    let filter_candidates = filter_candidates(effort);
    let compression_candidates = compression_candidates(effort);
    let mut best: Option<Vec<u8>> = None;

    for filter in filter_candidates {
        for compression in compression_candidates.iter().copied() {
            let encoded = encode_variant(rgba, width, height, representation, compression, filter)?;
            if best
                .as_ref()
                .map(|current| encoded.len() < current.len())
                .unwrap_or(true)
            {
                best = Some(encoded);
            }
        }
    }

    best.ok_or_else(|| "PNG encoding failed".to_string())
}

fn filter_candidates(effort: u8) -> Vec<Filter> {
    match effort {
        0..=2 => vec![Filter::Adaptive, Filter::Paeth],
        3..=5 => vec![Filter::Adaptive, Filter::Paeth, Filter::Sub, Filter::Up],
        _ => vec![
            Filter::Adaptive,
            Filter::Paeth,
            Filter::Sub,
            Filter::Up,
            Filter::Avg,
            Filter::MinEntropy,
        ],
    }
}

fn compression_candidates(effort: u8) -> Vec<Compression> {
    match effort {
        0..=1 => vec![Compression::Fast],
        2..=4 => vec![Compression::Fast, Compression::Balanced],
        _ => vec![Compression::Balanced, Compression::High],
    }
}

fn encode_variant(
    rgba: &[u8],
    width: u32,
    height: u32,
    representation: PngRepresentation,
    compression: Compression,
    filter: Filter,
) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    let mut encoder = Encoder::new(&mut cursor, width, height);
    encoder.set_compression(compression);
    encoder.set_filter(filter);

    let image_bytes = match representation {
        PngRepresentation::Rgba => {
            encoder.set_color(ColorType::Rgba);
            encoder.set_depth(BitDepth::Eight);
            rgba.to_vec()
        }
        PngRepresentation::Rgb => {
            encoder.set_color(ColorType::Rgb);
            encoder.set_depth(BitDepth::Eight);
            rgba.chunks_exact(4)
                .flat_map(|pixel| [pixel[0], pixel[1], pixel[2]])
                .collect::<Vec<_>>()
        }
        PngRepresentation::Grayscale => {
            encoder.set_color(ColorType::Grayscale);
            encoder.set_depth(BitDepth::Eight);
            rgba.chunks_exact(4).map(|pixel| pixel[0]).collect::<Vec<_>>()
        }
        PngRepresentation::GrayscaleAlpha => {
            encoder.set_color(ColorType::GrayscaleAlpha);
            encoder.set_depth(BitDepth::Eight);
            rgba.chunks_exact(4)
                .flat_map(|pixel| [pixel[0], pixel[3]])
                .collect::<Vec<_>>()
        }
        PngRepresentation::Indexed => {
            let (indices, _palette_len, palette, trns) =
                build_indexed_data(rgba).ok_or_else(|| "Unable to build palette".to_string())?;
            encoder.set_color(ColorType::Indexed);
            encoder.set_depth(BitDepth::Eight);
            encoder.set_palette(palette);
            if trns.iter().any(|alpha| *alpha != 255) {
                encoder.set_trns(trns);
            }
            indices
        }
    };

    let mut writer = encoder.write_header().map_err(|error| error.to_string())?;
    writer
        .write_image_data(&image_bytes)
        .map_err(|error| error.to_string())?;
    drop(writer);
    Ok(cursor.into_inner())
}

fn quantize_rgba(rgba: &[u8], width: usize, height: usize, config: LossyPngConfig) -> Vec<u8> {
    let bits = config.posterize_bits.clamp(1, 8);
    let levels = (1_u16 << bits.min(8) as u16) as f32;
    let bayer = [
        [0.0, 8.0, 2.0, 10.0],
        [12.0, 4.0, 14.0, 6.0],
        [3.0, 11.0, 1.0, 9.0],
        [15.0, 7.0, 13.0, 5.0],
    ];
    let mut out = rgba.to_vec();
    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) * 4;
            let alpha = out[index + 3] as f32 / 255.0;
            let alpha_weight = alpha.powf(config.alpha_protection.max(0.25));
            let threshold = (bayer[y % 4][x % 4] / 16.0 - 0.5) * config.dither_amount;
            for channel in 0..3 {
                let value = out[index + channel] as f32 / 255.0;
                let shifted = (value + threshold / levels).clamp(0.0, 1.0);
                let quantized = ((shifted * (levels - 1.0)).round() / (levels - 1.0)) * 255.0;
                let mixed = value * (1.0 - alpha_weight) * 255.0 + quantized * alpha_weight;
                out[index + channel] = mixed.round().clamp(0.0, 255.0) as u8;
            }
        }
    }

    if config.palette_size >= 2 {
        if let Some((palette, _)) = build_frequency_palette(&out, config.palette_size as usize) {
            remap_to_palette(&mut out, &palette, config.alpha_protection);
        }
    }

    out
}

fn build_exact_palette(rgba: &[u8], max_colors: usize) -> Option<(HashMap<u32, u8>, u8)> {
    let mut palette = HashMap::new();
    let mut next_index = 0_u8;
    for pixel in rgba.chunks_exact(4) {
        let key = u32::from_be_bytes([pixel[0], pixel[1], pixel[2], pixel[3]]);
        if palette.contains_key(&key) {
            continue;
        }
        if palette.len() >= max_colors {
            return None;
        }
        palette.insert(key, next_index);
        next_index = next_index.saturating_add(1);
    }

    let palette_len = match palette.len() {
        0..=2 => 1,
        3..=4 => 2,
        5..=16 => 4,
        _ => 8,
    };
    Some((palette, palette_len))
}

fn build_indexed_data(rgba: &[u8]) -> Option<(Vec<u8>, usize, Vec<u8>, Vec<u8>)> {
    let (palette_map, _) = build_exact_palette(rgba, 256)?;
    let mut palette_entries = vec![PaletteEntry {
        rgba: [0, 0, 0, 0],
        count: 0,
    }; palette_map.len()];
    for (key, index) in palette_map.iter() {
        let bytes = key.to_be_bytes();
        palette_entries[*index as usize].rgba = bytes;
    }

    let mut indices = Vec::with_capacity(rgba.len() / 4);
    for pixel in rgba.chunks_exact(4) {
        let key = u32::from_be_bytes([pixel[0], pixel[1], pixel[2], pixel[3]]);
        let index = *palette_map.get(&key)?;
        palette_entries[index as usize].count += 1;
        indices.push(index);
    }

    let palette_len = palette_entries.len();
    let mut palette = Vec::with_capacity(palette_len * 3);
    let mut trns = Vec::with_capacity(palette_len);
    for entry in palette_entries {
        palette.extend_from_slice(&entry.rgba[..3]);
        trns.push(entry.rgba[3]);
    }
    Some((indices, palette_len, palette, trns))
}

fn build_frequency_palette(rgba: &[u8], max_colors: usize) -> Option<(Vec<[u8; 4]>, usize)> {
    let mut histogram = HashMap::<u32, u32>::new();
    for pixel in rgba.chunks_exact(4) {
        let key = u32::from_be_bytes([pixel[0], pixel[1], pixel[2], pixel[3]]);
        *histogram.entry(key).or_insert(0) += 1;
    }

    if histogram.is_empty() {
        return None;
    }

    let mut entries = histogram
        .into_iter()
        .map(|(key, count)| PaletteEntry {
            rgba: key.to_be_bytes(),
            count,
        })
        .collect::<Vec<_>>();
    entries.sort_by(|lhs, rhs| rhs.count.cmp(&lhs.count));
    let mut palette = entries
        .iter()
        .take(max_colors.max(2))
        .map(|entry| entry.rgba)
        .collect::<Vec<_>>();

    if palette.len() > max_colors {
        palette.truncate(max_colors);
    }

    Some((palette, entries.len()))
}

fn remap_to_palette(rgba: &mut [u8], palette: &[[u8; 4]], alpha_protection: f32) {
    for pixel in rgba.chunks_exact_mut(4) {
        let mut best = palette[0];
        let mut best_distance = weighted_distance(pixel, &palette[0], alpha_protection);
        for entry in palette.iter().skip(1) {
            let distance = weighted_distance(pixel, entry, alpha_protection);
            if distance < best_distance {
                best = *entry;
                best_distance = distance;
            }
        }
        pixel.copy_from_slice(&best);
    }
}

fn weighted_distance(lhs: &[u8], rhs: &[u8; 4], alpha_protection: f32) -> f32 {
    let dr = lhs[0] as f32 - rhs[0] as f32;
    let dg = lhs[1] as f32 - rhs[1] as f32;
    let db = lhs[2] as f32 - rhs[2] as f32;
    let da = (lhs[3] as f32 - rhs[3] as f32) * alpha_protection.max(0.1);
    0.2126 * dr * dr + 0.7152 * dg * dg + 0.0722 * db * db + da * da
}

#[cfg(test)]
mod tests {
    use super::{encode_png_lossless_best, encode_png_lossy_candidate, LosslessPngConfig, LossyPngConfig};

    #[test]
    fn creates_lossless_png() {
        let rgba = vec![
            255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 0, 255,
        ];
        let encoded = encode_png_lossless_best(&rgba, 2, 2, LosslessPngConfig { effort: 4 }).unwrap();
        assert!(encoded.starts_with(&[137, 80, 78, 71]));
    }

    #[test]
    fn creates_lossy_png_candidate() {
        let rgba = [255, 0, 0, 255].repeat(16);
        let encoded = encode_png_lossy_candidate(
            &rgba,
            4,
            4,
            LossyPngConfig {
                palette_size: 16,
                posterize_bits: 5,
                dither_amount: 0.25,
                alpha_protection: 1.5,
                effort: 4,
            },
        )
        .unwrap();
        assert!(encoded.starts_with(&[137, 80, 78, 71]));
    }
}

use jpeg_encoder::{ColorType, Encoder, SamplingFactor};

pub fn encode_jpeg_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    quality: u8,
    subsampling: &str,
    progressive: bool,
) -> Result<Vec<u8>, String> {
    let mut rgb = Vec::with_capacity((width as usize) * (height as usize) * 3);
    for pixel in rgba.chunks_exact(4) {
        rgb.push(pixel[0]);
        rgb.push(pixel[1]);
        rgb.push(pixel[2]);
    }

    let mut encoded = Vec::new();
    let mut encoder = Encoder::new(&mut encoded, quality);
    encoder.set_sampling_factor(match subsampling {
        "444" => SamplingFactor::R_4_4_4,
        "420" => SamplingFactor::R_4_2_0,
        _ => SamplingFactor::R_4_4_4,
    });
    encoder.set_progressive(progressive);
    encoder.set_optimized_huffman_tables(true);
    encoder
        .encode(&rgb, width as u16, height as u16, ColorType::Rgb)
        .map_err(|error| error.to_string())?;

    Ok(encoded)
}

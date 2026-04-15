use webp_rust::{encode, ImageBuffer, WebpEncoding};

pub fn encode_webp_rgba(
    rgba: &[u8],
    width: u32,
    height: u32,
    quality: u8,
    effort: u8,
    lossless: bool,
) -> Result<Vec<u8>, String> {
    let image = ImageBuffer {
        width: width as usize,
        height: height as usize,
        rgba: rgba.to_vec(),
    };
    let mode = if lossless {
        WebpEncoding::Lossless
    } else {
        WebpEncoding::Lossy
    };
    encode(&image, effort as usize, quality as usize, mode, None).map_err(|error| error.to_string())
}

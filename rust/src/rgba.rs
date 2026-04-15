#[allow(dead_code)]
pub fn has_alpha(rgba: &[u8]) -> bool {
    rgba.chunks_exact(4).any(|pixel| pixel[3] != 255)
}

pub fn normalize_transparent_pixels(rgba: &mut [u8]) {
    for pixel in rgba.chunks_exact_mut(4) {
        if pixel[3] == 0 {
            pixel[0] = 0;
            pixel[1] = 0;
            pixel[2] = 0;
        }
    }
}

pub fn composite_rgba_over_bg(
    rgba: &[u8],
    width: usize,
    height: usize,
    background: BackgroundMode,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(width * height * 3);
    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) * 4;
            let alpha = rgba[index + 3] as f32 / 255.0;
            let (br, bg, bb) = background.color_at(x, y);
            let r = blend_channel(rgba[index], br, alpha);
            let g = blend_channel(rgba[index + 1], bg, alpha);
            let b = blend_channel(rgba[index + 2], bb, alpha);
            out.push(r);
            out.push(g);
            out.push(b);
        }
    }
    out
}

fn blend_channel(src: u8, bg: u8, alpha: f32) -> u8 {
    let value = src as f32 * alpha + bg as f32 * (1.0 - alpha);
    value.round().clamp(0.0, 255.0) as u8
}

#[derive(Clone, Copy, Debug)]
pub enum BackgroundMode {
    White,
    Black,
    Gray,
    Checker,
}

impl BackgroundMode {
    pub fn all() -> [BackgroundMode; 4] {
        [
            BackgroundMode::White,
            BackgroundMode::Black,
            BackgroundMode::Gray,
            BackgroundMode::Checker,
        ]
    }

    pub fn color_at(self, x: usize, y: usize) -> (u8, u8, u8) {
        match self {
            BackgroundMode::White => (255, 255, 255),
            BackgroundMode::Black => (0, 0, 0),
            BackgroundMode::Gray => (127, 127, 127),
            BackgroundMode::Checker => {
                let tile = ((x / 16) + (y / 16)) % 2;
                if tile == 0 {
                    (240, 240, 240)
                } else {
                    (160, 160, 160)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{composite_rgba_over_bg, has_alpha, normalize_transparent_pixels, BackgroundMode};

    #[test]
    fn detects_alpha() {
        let rgba = vec![0, 0, 0, 255, 10, 20, 30, 200];
        assert!(has_alpha(&rgba));
    }

    #[test]
    fn clears_fully_transparent_rgb() {
        let mut rgba = vec![120, 100, 50, 0, 10, 20, 30, 255];
        normalize_transparent_pixels(&mut rgba);
        assert_eq!(&rgba[..4], &[0, 0, 0, 0]);
    }

    #[test]
    fn composites_rgba() {
        let rgba = vec![255, 0, 0, 128];
        let rgb = composite_rgba_over_bg(&rgba, 1, 1, BackgroundMode::White);
        assert!(rgb[0] >= 254);
        assert!(rgb[1] >= 126);
        assert!(rgb[2] >= 126);
    }
}

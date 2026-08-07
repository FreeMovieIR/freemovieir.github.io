export function chooseConversionPolicy(probe = {}, target = {}) {
    const videoCodec = String(probe.videoCodec || "").toLowerCase();
    const audioCodec = String(probe.audioCodec || "").toLowerCase();
    const container = String(probe.container || "").toLowerCase();
    const targetSupportsHevc = Boolean(target.supportsHevc);
    const h264 = /h264|avc/.test(videoCodec);
    const hevc = /hevc|h265|h\.265/.test(videoCodec);
    const aac = /aac/.test(audioCodec);

    if (/matroska|mkv|webm/.test(container) && h264 && aac) {
        return { mode: "remux", videoCodec: "copy", audioCodec: "copy", output: "hls-fmp4" };
    }
    if (hevc && aac && targetSupportsHevc) {
        return { mode: "remux", videoCodec: "copy", audioCodec: "copy", output: "hls-fmp4" };
    }
    return {
        mode: "transcode",
        videoCodec: "libx264",
        audioCodec: "aac",
        audioChannels: 2,
        output: "hls-fmp4"
    };
}

export function buildFfprobeArgs(sourceUrl) {
    return [
        "-v", "error",
        "-show_format",
        "-show_streams",
        "-of", "json",
        sourceUrl
    ];
}

export function buildFfmpegArgs({ sourceUrl, outputManifest, policy }) {
    const initSegment = String(outputManifest || "stream.m3u8")
        .replace(/\\/g, "/")
        .replace(/[^/]+$/, "init.mp4");
    const args = [
        "-hide_banner",
        "-y",
        "-i", sourceUrl,
        "-map", "0:v:0",
        "-map", "0:a:0?"
    ];
    if (policy.mode === "remux") {
        args.push("-c:v", "copy", "-c:a", "copy");
    } else {
        args.push(
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-profile:v", "main",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-ac", "2",
            "-b:a", "160k"
        );
    }
    args.push(
        "-f", "hls",
        "-hls_time", "4",
        "-hls_playlist_type", "vod",
        "-hls_segment_type", "fmp4",
        "-hls_fmp4_init_filename", initSegment,
        "-hls_flags", "independent_segments",
        outputManifest
    );
    return args;
}

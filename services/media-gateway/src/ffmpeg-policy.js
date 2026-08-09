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
    if (/matroska|mkv|webm/.test(container) && h264 && !aac) {
        return {
            mode: "transcode-audio",
            videoCodec: "copy",
            audioCodec: "aac",
            audioChannels: 2,
            output: "hls-fmp4"
        };
    }
    if (hevc && aac && targetSupportsHevc) {
        return { mode: "remux", videoCodec: "copy", audioCodec: "copy", output: "hls-fmp4" };
    }
    if (hevc && !aac && targetSupportsHevc) {
        return {
            mode: "transcode-audio",
            videoCodec: "copy",
            audioCodec: "aac",
            audioChannels: 2,
            output: "hls-fmp4"
        };
    }
    if (aac) {
        return {
            mode: "transcode-video",
            videoCodec: "libx264",
            audioCodec: "copy",
            output: "hls-fmp4"
        };
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
        "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
        "-show_format",
        "-show_streams",
        "-of", "json",
        sourceUrl
    ];
}

export function buildFfmpegArgs({ sourceUrl, outputManifest, policy }) {
    const args = [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-protocol_whitelist", "file,http,https,tcp,tls,crypto",
        "-i", sourceUrl,
        "-map", "0:v:0",
        "-map", "0:a:0?"
    ];
    if (policy.videoCodec === "copy") {
        args.push("-c:v", "copy");
    } else {
        args.push(
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-profile:v", "main",
            "-pix_fmt", "yuv420p"
        );
    }
    if (policy.audioCodec === "copy") {
        args.push("-c:a", "copy");
    } else {
        args.push("-c:a", "aac", "-ac", String(policy.audioChannels || 2), "-b:a", "160k");
    }
    if (policy.mode === "remux") {
        args.push("-max_muxing_queue_size", "4096");
    }
    args.push(
        "-f", "hls",
        "-hls_time", "4",
        "-hls_playlist_type", "vod",
        "-hls_segment_type", "fmp4",
        "-hls_fmp4_init_filename", "init.mp4",
        "-hls_flags", "independent_segments+temp_file",
        outputManifest
    );
    return args;
}

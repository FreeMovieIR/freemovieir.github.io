import assert from "node:assert/strict";
import { test } from "node:test";
import {
    classifyMediaElementError,
    classifyMkvCapability,
    isMatroskaSignature,
    MEDIA_ADAPTERS,
    MEDIA_ERROR_KIND,
    parseMediaUrl,
    selectMediaAdapter
} from "../../watch-party/js/media-probe.js";
import { isSupportedDirectMediaUrl } from "../../watch-party/js/utils.js";

test("media URL parsing handles query strings, uppercase extensions, encoded names, and missing extensions", () => {
    assert.equal(parseMediaUrl("https://cdn.example.test/film.MP4?token=private#x").extension, "mp4");
    assert.equal(parseMediaUrl("https://cdn.example.test/my%20film.webm?sig=1").fileName, "my film.webm");
    assert.equal(parseMediaUrl("https://cdn.example.test/signed/media?token=1").extension, "");
});

test("native media is not rejected only because canPlayType is empty", () => {
    assert.equal(isSupportedDirectMediaUrl("https://example.test/movie.mp4?sig=1", "freemovieir.github.io", () => ""), true);
    assert.equal(isSupportedDirectMediaUrl("https://example.test/movie.MP4", "freemovieir.github.io", () => ""), true);
    assert.equal(isSupportedDirectMediaUrl("https://example.test/no-extension?x=1", "freemovieir.github.io", () => ""), true);
});

test("adapter selection is native-first except HLS and MKV compatibility routes", () => {
    assert.equal(selectMediaAdapter("https://example.test/movie.mp4").adapter, MEDIA_ADAPTERS.NATIVE);
    assert.equal(selectMediaAdapter("https://example.test/movie").adapter, MEDIA_ADAPTERS.NATIVE);
    assert.equal(selectMediaAdapter("https://example.test/live.m3u8").adapter, MEDIA_ADAPTERS.HLS);
    assert.equal(selectMediaAdapter("https://example.test/movie.mkv").adapter, MEDIA_ADAPTERS.MKV);
});

test("media element error classification keeps network, decode, unsupported, and timeout distinct", () => {
    assert.equal(classifyMediaElementError({ error: { code: 2 } }), MEDIA_ERROR_KIND.NETWORK);
    assert.equal(classifyMediaElementError({ error: { code: 3 } }), MEDIA_ERROR_KIND.DECODE);
    assert.equal(classifyMediaElementError({ error: { code: 4 } }), MEDIA_ERROR_KIND.SOURCE_NOT_SUPPORTED);
    assert.equal(classifyMediaElementError({}, true), MEDIA_ERROR_KIND.TIMEOUT);
});

test("MKV signature and capability checks are truthful, not extension-only", () => {
    assert.equal(isMatroskaSignature(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), true);
    assert.equal(isMatroskaSignature(Uint8Array.from([0, 0, 0, 0])), false);
    assert.deepEqual(classifyMkvCapability({ container: "matroska", videoCodec: "h264", audioCodec: "aac", webCodecs: true }), {
        playable: true,
        reason: "best-effort-supported"
    });
    assert.equal(classifyMkvCapability({ container: "matroska", videoCodec: "h264", audioCodec: "dts", webCodecs: true }).playable, false);
    assert.equal(classifyMkvCapability({ container: "matroska", videoCodec: "hevc", audioCodec: "aac", webCodecs: true }).playable, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { FULLSCREEN_CAPABILITY, FullscreenController, getFullscreenCapability } from "../../watch-party/js/fullscreen-controller.js";

function makeDoc() {
    const listeners = new Map();
    const body = {
        classList: makeClassList(),
        style: {},
        append() {}
    };
    return {
        fullscreenEnabled: false,
        fullscreenElement: null,
        body,
        documentElement: { scrollTop: 0 },
        createElement(tag) {
            return makeElement(tag);
        },
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); },
        dispatch(type) { listeners.get(type)?.({ type }); }
    };
}

function makeElement(tag = "div") {
    const listeners = new Map();
    const children = [];
    const element = {
        tagName: tag.toUpperCase(),
        readyState: 0,
        videoWidth: 0,
        duration: NaN,
        style: {},
        dataset: {},
        classList: makeClassList(),
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); },
        remove() { this.removed = true; },
        dispatch(type) { listeners.get(type)?.({ type }); },
        append(child) { children.push(child); },
        querySelector(selector) {
            if (selector === "[data-cinema-exit]") return children.find((child) => child.dataset?.cinemaExit);
            if (selector === "[data-cinema-orientation-hint]") return children.find((child) => child.dataset?.cinemaOrientationHint);
            return null;
        }
    };
    return element;
}

function makeClassList() {
    const classes = new Set();
    return {
        add(value) { classes.add(value); },
        remove(value) { classes.delete(value); },
        contains(value) { return classes.has(value); }
    };
}

test("standard fullscreen is preferred when available", () => {
    const doc = makeDoc();
    const wrapper = makeElement();
    const video = makeElement("video");
    doc.fullscreenEnabled = true;
    wrapper.requestFullscreen = async () => { doc.fullscreenElement = wrapper; };
    assert.equal(getFullscreenCapability({ wrapper, video, doc }), FULLSCREEN_CAPABILITY.STANDARD_ELEMENT_FULLSCREEN);
});

test("WebKit video fullscreen requires loaded metadata and is invoked synchronously", () => {
    const doc = makeDoc();
    const wrapper = makeElement();
    const video = makeElement("video");
    let entered = false;
    video.webkitSupportsFullscreen = true;
    video.webkitEnterFullscreen = () => { entered = true; };
    assert.equal(getFullscreenCapability({ wrapper, video, doc }), FULLSCREEN_CAPABILITY.CSS_CINEMA_MODE);
    video.readyState = 1;
    const controller = new FullscreenController({ wrapper, video, doc, win: { scrollY: 0, scrollTo() {}, setTimeout } });
    assert.equal(controller.enterFromUserGesture(), true);
    assert.equal(entered, true);
});

test("CSS Cinema Mode locks scroll and cleans up", () => {
    const doc = makeDoc();
    const wrapper = makeElement();
    const video = makeElement("video");
    const win = { scrollY: 42, scrollTo(x, y) { this.restored = y; }, setTimeout, matchMedia: () => ({ matches: false }) };
    const controller = new FullscreenController({ wrapper, video, doc, win });
    controller.enterFromUserGesture();
    assert.equal(wrapper.classList.contains("cinema-mode-active"), true);
    assert.equal(doc.body.classList.contains("watch-party-cinema-lock"), true);
    controller.exitCinemaMode();
    assert.equal(wrapper.classList.contains("cinema-mode-active"), false);
    assert.equal(doc.body.classList.contains("watch-party-cinema-lock"), false);
    assert.equal(win.restored, 42);
});

test("fullscreen exit clears stale cinema DOM state even when mode is out of sync", () => {
    const doc = makeDoc();
    const wrapper = makeElement();
    const video = makeElement("video");
    const win = { scrollY: 0, scrollTo(x, y) { this.restored = y; }, setTimeout, matchMedia: () => ({ matches: false }) };
    const controller = new FullscreenController({ wrapper, video, doc, win });
    wrapper.classList.add("cinema-mode-active");
    doc.body.classList.add("watch-party-cinema-lock");
    controller.mode = null;

    assert.equal(controller.isActive(), true);
    controller.exit();

    assert.equal(wrapper.classList.contains("cinema-mode-active"), false);
    assert.equal(doc.body.classList.contains("watch-party-cinema-lock"), false);
});

import { MediaController } from "./media-controller.js";

export function createPrivateMediaController(video, config, firebaseClient) {
    return new MediaController(video, config, {
        tokenProvider: async () => firebaseClient?.auth?.currentUser?.getIdToken?.() || ""
    });
}

import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

/** Starts the MSW service worker in dev when VITE_USE_MOCKS=true. */
export const worker = setupWorker(...handlers);

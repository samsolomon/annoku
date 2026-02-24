export { buildOverlayScript } from "./annotationOverlay.js";
export {
  AnnotationServer,
  annotationServer,
  getAnnotationPort,
  isAllowedOrigin,
  readPortFile,
} from "./annotationServer.js";

export type { Annotation, AnnotationElement, ScreenshotCallback, PortFileData } from "./annotationServer.js";

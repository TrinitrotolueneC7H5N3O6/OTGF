/** Small JPEG data URL for cheap vision describe calls. */
export async function imageThumbDataUrl(
  src: string,
  maxEdge = 512,
  quality = 0.72,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const img = await loadImage(src);
    const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, maxEdge);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/** First-frame still from a video for cheap describe. */
export async function videoThumbDataUrl(
  src: string,
  maxEdge = 512,
  quality = 0.72,
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = src;

    await new Promise<void>((resolve, reject) => {
      const onReady = () => resolve();
      const onErr = () => reject(new Error("video load failed"));
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onErr, { once: true });
    });

    try {
      video.currentTime = Math.min(0.2, (video.duration || 1) * 0.05);
      await new Promise<void>((resolve) => {
        video.addEventListener("seeked", () => resolve(), { once: true });
      });
    } catch {
      // use whatever frame is ready
    }

    const { width, height } = fitSize(
      video.videoWidth || 640,
      video.videoHeight || 360,
      maxEdge,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

function fitSize(w: number, h: number, maxEdge: number) {
  const safeW = Math.max(1, w);
  const safeH = Math.max(1, h);
  const scale = Math.min(1, maxEdge / Math.max(safeW, safeH));
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

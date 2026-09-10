"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { IconArrowSend, IconMic, IconX } from "@/components/shared/Icons";

interface SpeechToTextModalProps {
  initialText: string;
  sending: boolean;
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
}

function appendSpeech(current: string, addition: string) {
  const left = current.trimEnd();
  const right = addition.trim();
  if (!right) return current;
  return left ? `${left} ${right}` : right;
}

function recorderOptions() {
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", format: "webm" },
    { mimeType: "audio/mp4", format: "m4a" },
    { mimeType: "audio/ogg;codecs=opus", format: "ogg" },
  ];
  return candidates.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
}

function blobBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

export function SpeechToTextModal({ initialText, sending, onClose, onSend }: SpeechToTextModalProps) {
  const recordingSupported =
    typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const [text, setText] = useState(initialText);
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [inputDetected, setInputDetected] = useState(false);
  const [captureSummary, setCaptureSummary] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() =>
    recordingSupported
      ? null
      : "Audio recording is not available in this browser. You can still type your message below.",
  );
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterSampleCountRef = useRef(0);
  const activeSampleCountRef = useRef(0);
  const peakRmsRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  function clearRecordingTimer() {
    if (recordingTimerRef.current != null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }

  function stopInputMeter() {
    if (meterFrameRef.current != null) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close();
    if (mountedRef.current) setInputLevel(0);
  }

  function startInputMeter(stream: MediaStream) {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.72;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    audioContextRef.current = audioContext;
    let lastUpdate = 0;

    const sampleInput = (now: number) => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) {
        const amplitude = (sample - 128) / 128;
        energy += amplitude * amplitude;
      }
      const rms = Math.sqrt(energy / samples.length);
      if (now - lastUpdate > 80) {
        meterSampleCountRef.current += 1;
        peakRmsRef.current = Math.max(peakRmsRef.current, rms);
        if (rms > 0.018) activeSampleCountRef.current += 1;
        const level = Math.min(1, rms * 8);
        setInputLevel(level);
        if (rms > 0.018) setInputDetected(true);
        lastUpdate = now;
      }
      meterFrameRef.current = window.requestAnimationFrame(sampleInput);
    };
    meterFrameRef.current = window.requestAnimationFrame(sampleInput);
  }

  function releaseMicrophone() {
    clearRecordingTimer();
    stopInputMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function transcribe(blob: Blob, format: string) {
    const audio = await blobBase64(blob);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 45_000);
    const response = await fetch("/api/ai/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio, format, language: navigator.language }),
      signal: controller.signal,
    }).finally(() => window.clearTimeout(timeout));
    const payload = (await response.json().catch(() => null)) as
      | { text?: unknown; error?: unknown }
      | null;
    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "The recording could not be transcribed.",
      );
    }
    if (typeof payload?.text === "string" && payload.text.trim() && mountedRef.current) {
      setText((current) => appendSpeech(current, payload.text as string));
    }
  }

  async function startListening() {
    if (!recordingSupported || listening) return;
    setError(null);
    const option = recorderOptions();
    if (!option) {
      setError("This browser cannot create a supported audio recording.");
      return;
    }
    try {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
      setCaptureSummary(null);
      setInputDetected(false);
      meterSampleCountRef.current = 0;
      activeSampleCountRef.current = 0;
      peakRmsRef.current = 0;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      startInputMeter(stream);
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: option.mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (!mountedRef.current) return;
        setListening(false);
        setProcessing(false);
        setError("The microphone stopped unexpectedly. Tap the mic to try again.");
        releaseMicrophone();
      };
      recorder.onstop = () => {
        releaseMicrophone();
        if (!mountedRef.current) return;
        const recording = new Blob(chunks, { type: option.mimeType });
        if (recording.size < 200) {
          setProcessing(false);
          setError("No audio was captured. Tap the mic and try again.");
          return;
        }
        const objectUrl = URL.createObjectURL(recording);
        const durationSeconds = Math.max(
          1,
          Math.round((Date.now() - recordingStartedAtRef.current) / 1_000),
        );
        previewUrlRef.current = objectUrl;
        setPreviewUrl(objectUrl);
        setCaptureSummary(
          `${durationSeconds} sec · ${Math.max(1, Math.round(recording.size / 1024))} KB`,
        );
        const activeRatio = activeSampleCountRef.current / Math.max(1, meterSampleCountRef.current);
        const audioTooQuiet =
          meterSampleCountRef.current > 0 &&
          (peakRmsRef.current < 0.025 ||
            activeSampleCountRef.current < 2 ||
            activeRatio < 0.02);
        if (audioTooQuiet) {
          setProcessing(false);
          setError(
            "The recording is too quiet to transcribe reliably, so it was not sent. Move closer to the microphone or increase the input volume, then record again.",
          );
          return;
        }
        void transcribe(recording, option.format)
          .catch((cause: unknown) => {
            if (!mountedRef.current) return;
            setError(
              cause instanceof DOMException && cause.name === "AbortError"
                ? "Transcription took too long. Tap the mic to try again."
                : cause instanceof Error
                  ? cause.message
                  : "The recording could not be transcribed.",
            );
          })
          .finally(() => {
            if (mountedRef.current) setProcessing(false);
          });
      };
      setRecordingSeconds(0);
      setListening(true);
      recordingStartedAtRef.current = Date.now();
      recorder.start(1_000);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1_000);
    } catch (cause) {
      releaseMicrophone();
      setError(
        cause instanceof DOMException && cause.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow microphone access and try again."
          : "The microphone could not be opened. Check your device and try again.",
      );
    }
  }

  function stopListening() {
    clearRecordingTimer();
    setListening(false);
    setProcessing(true);
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else {
      releaseMicrophone();
      setProcessing(false);
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => micButtonRef.current?.focus());

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCloseRef.current();
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      clearRecordingTimer();
      stopInputMeter();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function editText(next: string) {
    if (listening) stopListening();
    setText(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || sending || listening || processing) return;
    await onSend(message);
  }

  return createPortal(
    <div className="speech-modal" role="dialog" aria-modal="true" aria-labelledby="speech-modal-title" onClick={onClose}>
      <form className="speech-modal-card" onSubmit={(event) => void submit(event)} onClick={(event) => event.stopPropagation()}>
        <header className="speech-modal-header">
          <div>
            <p className="speech-modal-kicker">Speech to text</p>
            <h2 id="speech-modal-title">Dictate a message</h2>
          </div>
          <button type="button" className="speech-modal-close" aria-label="Close speech to text" onClick={onClose}>
            <IconX size={18} />
          </button>
        </header>

        <div className="speech-modal-mic-wrap">
          <button
            ref={micButtonRef}
            type="button"
            className={`speech-modal-mic${listening ? " is-listening" : ""}`}
            aria-pressed={listening}
            aria-label={listening ? "Stop listening" : "Start listening"}
            disabled={!recordingSupported || (processing && !listening)}
            onClick={() => (listening ? stopListening() : void startListening())}
          >
            <span className="speech-modal-mic-pulse" aria-hidden />
            <IconMic size={30} />
          </button>
          <p className="speech-modal-status" role="status" aria-live="polite">
            {listening
              ? `Listening… ${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`
              : processing
                ? captureSummary
                  ? `Captured ${captureSummary}. Transcribing and cleaning up…`
                  : "Preparing the recording…"
                : "Tap the mic to start listening"}
          </p>
          {listening ? (
            <div className={`speech-modal-meter-wrap${!inputDetected && recordingSeconds >= 2 ? " is-low" : ""}`}>
              <div className="speech-modal-meter" aria-hidden>
                <span style={{ transform: `scaleX(${Math.max(0.025, inputLevel)})` }} />
              </div>
              <span>
                {inputDetected
                  ? "Microphone input detected"
                  : recordingSeconds >= 2
                    ? "Audio is too low—move closer or speak louder"
                    : "Waiting for microphone input…"}
              </span>
            </div>
          ) : null}
          {previewUrl ? (
            <div className="speech-modal-preview">
              <span>Recorded audio</span>
              <audio controls preload="metadata" src={previewUrl} />
            </div>
          ) : null}
        </div>

        <label className="speech-modal-editor">
          <span>Your message</span>
          <textarea value={text} rows={6} placeholder="Your words will appear here after you stop…" onChange={(event) => editText(event.target.value)} />
        </label>

        {error ? <p className="speech-modal-error" role="alert">{error}</p> : null}

        <footer className="speech-modal-footer">
          <button type="button" className="speech-modal-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="speech-modal-send" disabled={!text.trim() || sending || listening || processing}>
            <IconArrowSend size={16} />
            {sending ? "Sending…" : processing ? "Transcribing…" : "Send message"}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  );
}

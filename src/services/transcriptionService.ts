import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

/**
 * On-device speech-to-text for voice notes. Runs a small multilingual
 * Whisper model fully client-side (WASM) — no decrypted audio or text ever
 * leaves the device, preserving the same zero-knowledge guarantee as the
 * rest of the E2E system. First call downloads ~75MB of model weights,
 * cached by the browser afterwards.
 *
 * `@huggingface/transformers` (plus its onnxruntime-web WASM backend) is
 * dynamically imported here rather than at module scope — it's a large,
 * rarely-used dependency, and a static import would pull it into the app's
 * always-loaded main bundle even for sessions that never transcribe anything.
 */

const MODEL_ID = "Xenova/whisper-tiny";

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

export interface ModelProgress {
  loaded: number;
  total: number;
}

function getTranscriber(onProgress?: (progress: ModelProgress) => void) {
  if (!transcriberPromise) {
    transcriberPromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("automatic-speech-recognition", MODEL_ID, {
        progress_callback: (data: { status?: string; loaded?: number; total?: number }) => {
          if (
            onProgress &&
            data?.status === "progress" &&
            typeof data.loaded === "number" &&
            typeof data.total === "number"
          ) {
            onProgress({ loaded: data.loaded, total: data.total });
          }
        },
      })
    ) as Promise<AutomaticSpeechRecognitionPipeline>;
  }
  return transcriberPromise;
}

async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    void ctx.close();
  }
  if (decoded.sampleRate === 16000 && decoded.numberOfChannels === 1) {
    return decoded.getChannelData(0);
  }
  const targetLength = Math.max(1, Math.ceil(decoded.duration * 16000));
  const offlineCtx = new OfflineAudioContext(1, targetLength, 16000);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

export async function transcribeVoiceNote(
  blob: Blob,
  onModelProgress?: (progress: ModelProgress) => void
): Promise<string> {
  const [transcriber, samples] = await Promise.all([
    getTranscriber(onModelProgress),
    decodeTo16kMono(blob),
  ]);
  const result = await transcriber(samples, { chunk_length_s: 30 });
  const first = Array.isArray(result) ? result[0] : result;
  return (first?.text ?? "").trim();
}

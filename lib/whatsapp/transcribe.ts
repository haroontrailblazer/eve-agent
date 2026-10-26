import { transcribe } from "ai";

export const TRANSCRIPTION_MODEL = "openai/whisper-1";

// Voice notes are transcribed here, before a turn starts, so the agent only
// ever sees text. Throws when the audio yields nothing.
export async function transcribeVoiceNote(audio: Uint8Array, abortSignal?: AbortSignal): Promise<string> {
  const { text } = await transcribe({ model: TRANSCRIPTION_MODEL, audio, abortSignal });
  const transcript = text.trim();
  if (!transcript) throw new Error("The voice note had no speech.");
  return transcript;
}

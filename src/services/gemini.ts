import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const chatWithMentalHealthAI = async (history: { role: string; content: string }[], message: string) => {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    You are a professional, empathetic, and supportive mental health counselor (Psychologist).
    Your tone should be warm, non-judgmental, and professional.
    You can speak both Arabic and English fluently.
    Always prioritize the user's safety. If they express self-harm or danger, provide resources and encourage professional help.
    Your goal is to listen, validate feelings, and provide gentle guidance or coping strategies.
    Keep responses concise but meaningful.
    Use emojis occasionally to feel more human and approachable.
  `;

  const contents = [
    ...history.map(h => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    })),
    {
      role: "user",
      parts: [{ text: message }]
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text || "I'm sorry, I'm having trouble processing that right now. How else can I help you?";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I apologize, but I'm experiencing a technical issue. Please try again in a moment.";
  }
};

export const generateSpeech = async (text: string) => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // Gemini TTS returns raw PCM 16-bit mono at 24kHz.
      // We need to wrap it in a WAV header for the browser to play it.
      const binaryString = window.atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const wavHeader = new ArrayBuffer(44);
      const view = new DataView(wavHeader);

      // RIFF identifier
      view.setUint32(0, 0x52494646, false); // "RIFF"
      // file length
      view.setUint32(4, 36 + len, true);
      // RIFF type
      view.setUint32(8, 0x57415645, false); // "WAVE"
      // format chunk identifier
      view.setUint32(12, 0x666d7420, false); // "fmt "
      // format chunk length
      view.setUint32(16, 16, true);
      // sample format (raw)
      view.setUint16(20, 1, true);
      // channel count
      view.setUint16(22, 1, true);
      // sample rate
      view.setUint32(24, 24000, true);
      // byte rate (sample rate * block align)
      view.setUint32(28, 24000 * 2, true);
      // block align (channel count * bytes per sample)
      view.setUint16(32, 2, true);
      // bits per sample
      view.setUint16(34, 16, true);
      // data chunk identifier
      view.setUint32(36, 0x64617461, false); // "data"
      // data chunk length
      view.setUint32(40, len, true);

      const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
      return URL.createObjectURL(blob);
    }
  } catch (error) {
    console.error("TTS Error:", error);
  }
  return null;
};

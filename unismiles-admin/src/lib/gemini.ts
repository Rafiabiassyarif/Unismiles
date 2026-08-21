import api from './api';

export async function generateMarketingContent(prompt: string) {
  try {
    const res = await api.post("/ai/marketing", { prompt });
    return res.data.text;
  } catch (error) {
    console.error("AI Generation Error (via backend):", error);
    return "Sorry, I couldn't generate content right now. Please try again later.";
  }
}

export async function suggestLayout(eventType: string) {
  try {
    const res = await api.post("/ai/layout", { eventType });
    return res.data.layout;
  } catch (error) {
    console.error("AI Layout Suggestion Error (via backend):", error);
    return { photosCount: 4, textOverlays: ["Event Name", "Date"] };
  }
}

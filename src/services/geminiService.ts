import { GoogleGenAI, Type } from "@google/genai";

export interface ScheduleItem {
  stationName: string;
  stationCode: string;
  arrivalTime: string;
  departureTime: string;
  haltTime: number;
  distance: number;
  day: number;
}

export interface TrainData {
  trainNo: string;
  trainName: string;
  schedule: ScheduleItem[];
}

export async function fetchTrainSchedule(trainNo: string): Promise<TrainData | null> {
  // Try to get the API key from multiple possible sources
  // In AI Studio, GEMINI_API_KEY is usually available in process.env
  const apiKey = (process.env.GEMINI_API_KEY as string) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
  
  // We'll proceed even if apiKey is empty, as the SDK might have its own way of resolving it 
  // or the environment might have it injected globally.
  const ai = new GoogleGenAI({ apiKey });

  try {
    console.log(`Searching for train ${trainNo} (v1.0.2)...`);
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Find the current, official timetable for Indian Railways train number ${trainNo}. 
      I need the full schedule including station names, codes, arrival/departure times, and distance.
      Return the data in a structured format.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            trainNo: { type: Type.STRING },
            trainName: { type: Type.STRING },
            schedule: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stationName: { type: Type.STRING },
                  stationCode: { type: Type.STRING },
                  arrivalTime: { type: Type.STRING },
                  departureTime: { type: Type.STRING },
                  haltTime: { type: Type.NUMBER },
                  distance: { type: Type.NUMBER },
                  day: { type: Type.NUMBER }
                },
                required: ["stationName", "stationCode", "arrivalTime", "departureTime"]
              }
            }
          },
          required: ["trainNo", "trainName", "schedule"]
        }
      },
    });

    if (!response.text) {
      console.warn("Empty response from Gemini for train:", trainNo);
      return null;
    }
    
    console.log("Gemini Response Received");

    try {
      const cleanedText = response.text.replace(/```json\n?|```/g, '').trim();
      const data = JSON.parse(cleanedText);
      
      if (!data.schedule || data.schedule.length === 0) {
        return null;
      }

      // Ensure all fields have defaults if missing from AI response
      const processedSchedule = data.schedule.map((item: any) => ({
        stationName: item.stationName || "Unknown",
        stationCode: item.stationCode || "???",
        arrivalTime: item.arrivalTime || "00:00",
        departureTime: item.departureTime || "00:00",
        haltTime: item.haltTime || 0,
        distance: item.distance || 0,
        day: item.day || 1
      }));

      return {
        trainNo: data.trainNo || trainNo,
        trainName: data.trainName || `Train ${trainNo}`,
        schedule: processedSchedule
      };
    } catch (parseError) {
      console.error("Failed to parse train data:", parseError);
      return null;
    }
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}

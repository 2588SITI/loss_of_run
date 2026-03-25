import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || '';
if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. Real-time train search will not work.");
}
const ai = new GoogleGenAI({ apiKey });

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
  try {
    console.log(`Starting search for train ${trainNo} using gemini-3.1-pro-preview...`);
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Search for the official, latest timetable of Indian Railways train number ${trainNo}. 
      Extract the full schedule including:
      - Train Name
      - Each station's name and code
      - Arrival and Departure times (in HH:mm format)
      - Halt time in minutes
      - Cumulative distance in km
      - Day number (1, 2, etc.)
      
      Ensure you get the most recent data from official sources like NTES, IRCTC, or reliable travel portals.
      If you cannot find the exact JSON, return a JSON object with the train details you found.`,
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
                  arrivalTime: { type: Type.STRING, description: "HH:mm format, use 00:00 for start station" },
                  departureTime: { type: Type.STRING, description: "HH:mm format, use 00:00 for end station" },
                  haltTime: { type: Type.NUMBER },
                  distance: { type: Type.NUMBER },
                  day: { type: Type.NUMBER }
                },
                required: ["stationName", "stationCode", "arrivalTime", "departureTime", "haltTime", "distance", "day"]
              }
            }
          },
          required: ["trainNo", "trainName", "schedule"]
        }
      },
    });

    if (!response.text) {
      console.warn("No response text from Gemini for train:", trainNo);
      return null;
    }
    
    console.log("Raw response from Gemini:", response.text);

    try {
      // Clean the response text in case it has markdown code blocks
      const cleanedText = response.text.replace(/```json\n?|```/g, '').trim();
      const data = JSON.parse(cleanedText);
      if (!data.schedule || data.schedule.length === 0) {
        console.warn("Empty schedule returned for train:", trainNo);
        return null;
      }
      return data as TrainData;
    } catch (parseError) {
      console.error("JSON Parse Error for train schedule:", parseError, response.text);
      return null;
    }
  } catch (error) {
    console.error("Error fetching train schedule:", error);
    // Rethrow to handle in UI
    throw error;
  }
}

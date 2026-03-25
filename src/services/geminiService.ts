import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Fetch the latest official timetable for Indian Railways train number ${trainNo}. Include station name, station code, arrival time, departure time, halt time (minutes), distance (km), and day number. Return the data in a structured JSON format.`,
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
                  arrivalTime: { type: Type.STRING, description: "HH:mm format" },
                  departureTime: { type: Type.STRING, description: "HH:mm format" },
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

    if (!response.text) return null;
    
    const data = JSON.parse(response.text);
    return data as TrainData;
  } catch (error) {
    console.error("Error fetching train schedule:", error);
    return null;
  }
}

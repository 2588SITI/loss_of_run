/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  Upload, 
  Train, 
  Clock, 
  MapPin, 
  TrendingDown, 
  TrendingUp, 
  Zap,
  Info,
  ChevronRight,
  FileText,
  AlertCircle,
  Plus,
  X
} from 'lucide-react';
import Papa from 'papaparse';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { format, parse, differenceInMinutes, isValid } from 'date-fns';
import { cn } from './lib/utils';
import { fetchTrainSchedule, type TrainData, type ScheduleItem } from './services/geminiService';

// Types
interface RTISRecord {
  timestamp: string;
  lat: number;
  lon: number;
  speed: number;
  station?: string;
}

/**
 * Robust date parser for common Indian Railways formats
 */
const parseRTISDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  const cleanStr = dateStr.trim();
  if (!cleanStr) return null;

  // Try standard ISO or common JS formats
  let d = new Date(cleanStr);
  if (isValid(d)) return d;

  // Try replacing dashes with slashes for better native support
  const withSlashes = cleanStr.replace(/-/g, '/');
  d = new Date(withSlashes);
  if (isValid(d)) return d;

  const formats = [
    'M-d-yyyy HH:mm:ss',
    'MM-dd-yyyy HH:mm:ss',
    'M-d-yyyy HH:mm',
    'MM-dd-yyyy HH:mm',
    'M/d/yyyy HH:mm:ss',
    'MM/dd/yyyy HH:mm:ss',
    'M/d/yyyy HH:mm',
    'MM/dd/yyyy HH:mm',
    'd-M-yyyy HH:mm:ss',
    'dd-MM-yyyy HH:mm:ss',
    'd/M/yyyy HH:mm:ss',
    'dd/MM/yyyy HH:mm:ss',
    'd-M-yyyy HH:mm',
    'dd-MM-yyyy HH:mm',
    'd/M/yyyy HH:mm',
    'dd/MM/yyyy HH:mm',
    'yyyy-MM-dd HH:mm:ss',
    'yyyy-MM-dd HH:mm',
    'dd-MMM-yy HH:mm:ss',
    'dd-MMM-yyyy HH:mm:ss',
    'dd-MMM-yy HH:mm',
    'HH:mm:ss', // Time only
    'HH:mm'     // Time only
  ];

  for (const fmt of formats) {
    try {
      d = parse(cleanStr, fmt, new Date());
      if (isValid(d)) return d;
      
      // Also try with slashes if dashes failed
      d = parse(withSlashes, fmt, new Date());
      if (isValid(d)) return d;
    } catch (e) {}
  }

  // Last resort: manual split for M-D-YYYY or D-M-YYYY
  const parts = cleanStr.split(/[-/ :]/);
  if (parts.length >= 5) {
    const m = parseInt(parts[0]);
    const d_val = parseInt(parts[1]);
    const y = parseInt(parts[2]);
    const h = parseInt(parts[3]);
    const min = parseInt(parts[4]);
    const s = parts[5] ? parseInt(parts[5]) : 0;

    // Try M-D-YYYY
    if (m >= 1 && m <= 12 && d_val >= 1 && d_val <= 31 && y > 2000) {
      const testDate = new Date(y, m - 1, d_val, h, min, s);
      if (isValid(testDate)) return testDate;
    }
    // Try D-M-YYYY
    if (d_val >= 1 && d_val <= 12 && m >= 1 && m <= 31 && y > 2000) {
      const testDate = new Date(y, d_val - 1, m, h, min, s);
      if (isValid(testDate)) return testDate;
    }
  }

  return null;
};

// Sample Data Source for Demo
const SAMPLE_TRAINS: Record<string, TrainData> = {
  "12301": {
    trainNo: "12301",
    trainName: "Howrah Rajdhani Express",
    schedule: [
      { stationName: "Howrah Jn", stationCode: "HWH", arrivalTime: "00:00", departureTime: "16:50", haltTime: 0, distance: 0, day: 1 },
      { stationName: "Asansol Jn", stationCode: "ASN", arrivalTime: "18:57", departureTime: "18:59", haltTime: 2, distance: 200, day: 1 },
      { stationName: "Dhanbad Jn", stationCode: "DHN", arrivalTime: "19:55", departureTime: "20:00", haltTime: 5, distance: 259, day: 1 },
      { stationName: "Parasnath", stationCode: "PNME", arrivalTime: "20:30", departureTime: "20:32", haltTime: 2, distance: 307, day: 1 },
      { stationName: "Gaya Jn", stationCode: "GAYA", arrivalTime: "22:31", departureTime: "22:34", haltTime: 3, distance: 458, day: 1 },
      { stationName: "Pt DD Upadhyaya Jn", stationCode: "DDU", arrivalTime: "00:45", departureTime: "00:55", haltTime: 10, distance: 663, day: 2 },
      { stationName: "Prayagraj Jn", stationCode: "PRYJ", arrivalTime: "02:43", departureTime: "02:45", haltTime: 2, distance: 816, day: 2 },
      { stationName: "Kanpur Central", stationCode: "CNB", arrivalTime: "04:50", departureTime: "04:55", haltTime: 5, distance: 1010, day: 2 },
      { stationName: "New Delhi", stationCode: "NDLS", arrivalTime: "10:05", departureTime: "00:00", haltTime: 0, distance: 1451, day: 2 },
    ]
  },
  "12002": {
    trainNo: "12002",
    trainName: "New Delhi Bhopal Shatabdi",
    schedule: [
      { stationName: "New Delhi", stationCode: "NDLS", arrivalTime: "00:00", departureTime: "06:00", haltTime: 0, distance: 0, day: 1 },
      { stationName: "Mathura Jn", stationCode: "MTJ", arrivalTime: "07:19", departureTime: "07:20", haltTime: 1, distance: 141, day: 1 },
      { stationName: "Agra Cantt", stationCode: "AGC", arrivalTime: "07:50", departureTime: "07:55", haltTime: 5, distance: 195, day: 1 },
      { stationName: "Morena", stationCode: "MRA", arrivalTime: "08:39", departureTime: "08:40", haltTime: 1, distance: 275, day: 1 },
      { stationName: "Gwalior Jn", stationCode: "GWL", arrivalTime: "09:23", departureTime: "09:28", haltTime: 5, distance: 313, day: 1 },
      { stationName: "VGL Jhansi Jn", stationCode: "VGLJ", arrivalTime: "10:45", departureTime: "10:50", haltTime: 5, distance: 411, day: 1 },
      { stationName: "Lalitpur Jn", stationCode: "LAR", arrivalTime: "11:42", departureTime: "11:43", haltTime: 1, distance: 501, day: 1 },
      { stationName: "Bhopal Jn", stationCode: "BPL", arrivalTime: "14:25", departureTime: "00:00", haltTime: 0, distance: 702, day: 1 },
    ]
  }
};

interface ManualTrainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: TrainData) => void;
}

function ManualTrainModal({ isOpen, onClose, onSave }: ManualTrainModalProps) {
  const [trainNo, setTrainNo] = useState('');
  const [trainName, setTrainName] = useState('');
  const [schedule, setSchedule] = useState<ScheduleItem[]>([
    { stationName: '', stationCode: '', arrivalTime: '00:00', departureTime: '00:00', haltTime: 0, distance: 0, day: 1 }
  ]);
  const timetableFileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const addStation = () => {
    setSchedule([...schedule, { stationName: '', stationCode: '', arrivalTime: '00:00', departureTime: '00:00', haltTime: 0, distance: 0, day: 1 }]);
  };

  const removeStation = (index: number) => {
    setSchedule(schedule.filter((_, i) => i !== index));
  };

  const updateStation = (index: number, field: keyof ScheduleItem, value: any) => {
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], [field]: value };
    setSchedule(newSchedule);
  };

  const handleTimetableCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length === 0) return;

        // Find header row
        let headerIndex = -1;
        const stationKeywords = ['station', 'stn', 'code'];
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const row = rows[i].map(c => String(c).toLowerCase().trim());
          if (row.some(c => stationKeywords.some(k => c.includes(k)))) {
            headerIndex = i;
            break;
          }
        }
        if (headerIndex === -1) headerIndex = 0;

        const headers = rows[headerIndex].map(h => String(h).trim());
        const dataRows = rows.slice(headerIndex + 1);

        const newSchedule: ScheduleItem[] = dataRows.map(rowArr => {
          const row: any = {};
          headers.forEach((h, idx) => { row[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = rowArr[idx]; });
          
          const getVal = (keys: string[]) => {
            for (const k of keys) {
              const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (row[normK] !== undefined) return row[normK];
            }
            return '';
          };

          const sName = getVal(['station name', 'stationname', 'stn name', 'stnname', 'station', 'stn']);
          const sCode = getVal(['station code', 'stationcode', 'stn code', 'stncode', 'code', 'stn']);

          return {
            stationName: sName || sCode || 'Unknown',
            stationCode: sCode || sName || '',
            arrivalTime: getVal(['arrival', 'arrivaltime', 'arr']) || '00:00',
            departureTime: getVal(['departure', 'departuretime', 'dep']) || '00:00',
            haltTime: parseInt(getVal(['halt', 'halttime', 'haltm'])) || 0,
            distance: parseInt(getVal(['distance', 'dist', 'distkm'])) || 0,
            day: parseInt(getVal(['day'])) || 1
          };
        });

        if (newSchedule.length > 0) {
          setSchedule(newSchedule);
          // Try to guess train name/no from filename if not set
          if (!trainNo) {
            const match = file.name.match(/\d{5}/);
            if (match) setTrainNo(match[0]);
          }
        }
      },
      error: (error) => {
        alert("Error parsing CSV: " + error.message);
      }
    });
  };

  const handleSave = () => {
    if (!trainNo || !trainName || schedule.length === 0) {
      alert("Please fill in train number, name and at least one station.");
      return;
    }
    onSave({ trainNo, trainName, schedule });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-lg">
              <Plus className="w-5 h-5 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Manual Timetable Input</h2>
          </div>
          <div className="flex items-center gap-2">
            <input 
              type="file" 
              ref={timetableFileInputRef} 
              className="hidden" 
              accept=".csv" 
              onChange={handleTimetableCSVUpload}
            />
            <button 
              onClick={() => timetableFileInputRef.current?.click()}
              className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-full border border-indigo-200 transition-all"
            >
              <Upload className="w-4 h-4" />
              Upload CSV
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Train Number</label>
              <input 
                type="text" 
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. 12301"
                value={trainNo}
                onChange={(e) => setTrainNo(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Train Name</label>
              <input 
                type="text" 
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="e.g. Rajdhani Express"
                value={trainName}
                onChange={(e) => setTrainName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-700">Stations & Schedule</h3>
              <button 
                onClick={addStation}
                className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="w-4 h-4" />
                Add Station
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-3 font-semibold text-gray-500">Station Name</th>
                    <th className="pb-3 font-semibold text-gray-500">Code</th>
                    <th className="pb-3 font-semibold text-gray-500">Arrival</th>
                    <th className="pb-3 font-semibold text-gray-500">Departure</th>
                    <th className="pb-3 font-semibold text-gray-500">Halt (m)</th>
                    <th className="pb-3 font-semibold text-gray-500">Dist (km)</th>
                    <th className="pb-3 font-semibold text-gray-500">Day</th>
                    <th className="pb-3 font-semibold text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {schedule.map((s, idx) => (
                    <tr key={idx} className="group">
                      <td className="py-3 pr-2">
                        <input 
                          type="text" 
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                          value={s.stationName}
                          onChange={(e) => updateStation(idx, 'stationName', e.target.value)}
                        />
                      </td>
                      <td className="py-3 pr-2 w-20">
                        <input 
                          type="text" 
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                          value={s.stationCode}
                          onChange={(e) => updateStation(idx, 'stationCode', e.target.value)}
                        />
                      </td>
                      <td className="py-3 pr-2 w-24">
                        <input 
                          type="text" 
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                          value={s.arrivalTime}
                          onChange={(e) => updateStation(idx, 'arrivalTime', e.target.value)}
                        />
                      </td>
                      <td className="py-3 pr-2 w-24">
                        <input 
                          type="text" 
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                          value={s.departureTime}
                          onChange={(e) => updateStation(idx, 'departureTime', e.target.value)}
                        />
                      </td>
                      <td className="py-3 pr-2 w-20">
                        <input 
                          type="number" 
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                          value={s.haltTime}
                          onChange={(e) => updateStation(idx, 'haltTime', parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td className="py-3 pr-2 w-20">
                        <input 
                          type="number" 
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                          value={s.distance}
                          onChange={(e) => updateStation(idx, 'distance', parseInt(e.target.value) || 0)}
                        />
                      </td>
                      <td className="py-3 pr-2 w-20">
                        <input 
                          type="number" 
                          className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500"
                          value={s.day}
                          onChange={(e) => updateStation(idx, 'day', parseInt(e.target.value) || 1)}
                        />
                      </td>
                      <td className="py-3 text-right">
                        <button 
                          onClick={() => removeStation(idx)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3 sticky bottom-0 bg-white rounded-b-2xl">
          <button 
            onClick={onClose}
            className="px-6 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="bg-indigo-600 text-white px-8 py-2 rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Save Timetable
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [trainNo, setTrainNo] = useState('');
  const [activeTrain, setActiveTrain] = useState<TrainData | null>(null);
  const [isSearchingTrain, setIsSearchingTrain] = useState(false);
  const [lastSearchTime, setLastSearchTime] = useState(0);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const [searchStatus, setSearchStatus] = useState<string>('');
  const [rtisData, setRtisData] = useState<RTISRecord[]>([]);
  const [startStation, setStartStation] = useState('');
  const [endStation, setEndStation] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isTimetableUploading, setIsTimetableUploading] = useState(false);
  const [timetableUploadError, setTimetableUploadError] = useState<string | null>(null);
  const [isApiKeyMissing, setIsApiKeyMissing] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timetableFileInputRef = useRef<HTMLInputElement>(null);

  // Check for API key on mount
  useEffect(() => {
    const apiKey = (process.env.GEMINI_API_KEY as string) || (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      setIsApiKeyMissing(true);
    }
  }, []);

  // Handle Train Search
  const handleSearch = async () => {
    const trimmedTrainNo = trainNo.trim();
    if (!trimmedTrainNo || isSearchingTrain) return;

    // Prevent searching more than once every 20 seconds to respect API limits
    const now = Date.now();
    const timeSinceLastSearch = now - lastSearchTime;
    if (timeSinceLastSearch < 20000) {
      const remaining = Math.ceil((20000 - timeSinceLastSearch) / 1000);
      setRateLimitCountdown(remaining);
      const timer = setInterval(() => {
        setRateLimitCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return;
    }
    
    setLastSearchTime(now);
    console.log("Searching for train:", trimmedTrainNo);
    setIsSearchingTrain(true);
    setSearchStatus('Searching official records...');
    try {
      // Check sample first for quick demo
      if (SAMPLE_TRAINS[trimmedTrainNo]) {
        console.log("Found in Sample Data:", trimmedTrainNo);
        setSearchStatus('Loading sample data...');
        setActiveTrain(SAMPLE_TRAINS[trimmedTrainNo]);
        setStartStation('');
        setEndStation('');
      } else {
        console.log("Fetching from Gemini API:", trimmedTrainNo);
        setSearchStatus('Connecting to Indian Railways database...');
        
        // Add a 60s timeout to the fetch call
        const fetchPromise = fetchTrainSchedule(trimmedTrainNo);
        const timeoutPromise = new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error("Search timed out. The server is busy or the train number is invalid. Please try again.")), 60000)
        );

        const actualData = await Promise.race([fetchPromise, timeoutPromise]) as TrainData | null;
        
        if (actualData) {
          console.log("Successfully fetched from Gemini:", actualData.trainName);
          setSearchStatus('Schedule found!');
          setActiveTrain(actualData);
          setStartStation('');
          setEndStation('');
        } else {
          console.warn("Gemini API returned null for train:", trimmedTrainNo);
          setSearchStatus('');
          alert("Train schedule not found. Please verify the train number (e.g., 12301, 12002, 12423) and try again.");
        }
      }
    } catch (error) {
      console.error("Search error:", error);
      setSearchStatus('');
      let message = "An error occurred while searching for the train schedule.";
      if (error instanceof Error) {
        message = error.message;
        if (message.includes("Gemini API Key is missing")) {
          message = "Gemini API Key is missing. Please add it to your environment variables (Settings -> Secrets in AI Studio).";
          setIsApiKeyMissing(true);
        } else if (message.includes("403") || message.includes("Permission denied")) {
          message = "Connection Error: Please check if the Gemini API is enabled for your project.";
        } else if (message.includes("429") || message.includes("Quota exceeded") || message.includes("Too many requests")) {
          message = "The service is currently receiving too many requests. Please wait about 60 seconds and try again. This is a temporary limit of the free Gemini API (especially with Search enabled).";
        }
      }
      alert(message);
    } finally {
      setIsSearchingTrain(false);
      setTimeout(() => setSearchStatus(''), 3000);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      alert("Please upload a CSV file. Excel (.xlsx) files are not supported directly.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    Papa.parse(file, {
      header: false, // Parse as arrays first to find the header row
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length === 0) {
          setUploadError("The file appears to be empty.");
          setIsUploading(false);
          return;
        }

        // Find the header row
        let headerIndex = -1;
        const timeKeywords = ['time', 'timestamp', 'ist_time', 'date', 'date_time', 'datetime', 'logging time', 'logging_time'];
        
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const row = rows[i].map(c => String(c).toLowerCase().trim());
          const hasTime = row.some(c => timeKeywords.some(k => c.includes(k)));
          const hasSpeed = row.some(c => c.includes('speed') || c.includes('velocity'));
          
          if (hasTime && hasSpeed) {
            headerIndex = i;
            break;
          }
        }

        if (headerIndex === -1) {
          // Fallback to first row if no keywords found
          headerIndex = 0;
        }

        const headers = rows[headerIndex].map(h => String(h).trim());
        const dataRows = rows.slice(headerIndex + 1);

        const mappedData = dataRows.map((rowArr) => {
          const row: any = {};
          headers.forEach((h, idx) => {
            row[h] = rowArr[idx];
          });

          // Normalize row keys to lowercase for easier matching
          const normalizedRow: any = {};
          Object.keys(row).forEach(key => {
            normalizedRow[key.toLowerCase()] = row[key];
          });

          const findValue = (keys: string[]) => {
            for (const k of keys) {
              if (normalizedRow[k.toLowerCase()] !== undefined && normalizedRow[k.toLowerCase()] !== null) {
                return normalizedRow[k.toLowerCase()];
              }
            }
            return '';
          };

          // Flexible column mapping
          const rawTime = findValue(['logging time', 'logging_time', 'timestamp', 'time', 'ist_time', 'date', 'date_time', 'datetime', 'ist_date_time']);
          const parsedDate = parseRTISDate(String(rawTime));
          
          return {
            timestamp: parsedDate ? parsedDate.toISOString() : '',
            lat: findValue(['latitude', 'lat', 'lat_deg']),
            lon: findValue(['longitude', 'lon', 'lon_deg', 'long']),
            speed: findValue(['speed', 'speed_kmph', 'velocity', 'speedkmph']),
            station: findValue(['stationcode', 'station_code', 'station', 'stn', 'stn_code', 'station_name', 'location', 'halt_station', 'stnname']) || undefined
          };
        }).filter(r => r.timestamp);

        if (mappedData.length === 0) {
          const firstRow = dataRows[0] ? dataRows[0].join(', ') : 'No data rows';
          const errorMsg = `No valid records found. \n\nDetected Headers: ${headers.join(', ')}\n\nFirst Data Row: ${firstRow}\n\nPlease ensure your CSV has columns for Time, Speed, and Station.`;
          setUploadError(errorMsg);
          alert(errorMsg);
        } else {
          setRtisData(mappedData as RTISRecord[]);
          setUploadError(null);
        }
        setIsUploading(false);
      },
      error: (err) => {
        console.error("CSV Parse Error:", err);
        setUploadError("Error parsing CSV file. Ensure it is a valid comma-separated file.");
        setIsUploading(false);
      }
    });
  };

  // Handle Timetable File Upload
  const handleTimetableUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsTimetableUploading(true);
    setTimetableUploadError(null);

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as string[][];
        if (rows.length === 0) {
          setTimetableUploadError("The file appears to be empty.");
          setIsTimetableUploading(false);
          return;
        }

        // Find header row
        let headerIndex = -1;
        const stationKeywords = ['station', 'stn', 'code'];
        for (let i = 0; i < Math.min(rows.length, 20); i++) {
          const row = rows[i].map(c => String(c).toLowerCase().trim());
          if (row.some(c => stationKeywords.some(k => c.includes(k)))) {
            headerIndex = i;
            break;
          }
        }
        if (headerIndex === -1) headerIndex = 0;

        const headers = rows[headerIndex].map(h => String(h).trim());
        const dataRows = rows.slice(headerIndex + 1);

        const newSchedule: ScheduleItem[] = dataRows.map(rowArr => {
          const row: any = {};
          headers.forEach((h, idx) => { row[h.toLowerCase().replace(/[^a-z0-9]/g, '')] = rowArr[idx]; });
          
          const getVal = (keys: string[]) => {
            for (const k of keys) {
              const normK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (row[normK] !== undefined) return row[normK];
            }
            return '';
          };

          const sName = getVal(['station name', 'stationname', 'stn name', 'stnname', 'station', 'stn']);
          const sCode = getVal(['station code', 'stationcode', 'stn code', 'stncode', 'code', 'stn']);

          return {
            stationName: sName || sCode || 'Unknown',
            stationCode: sCode || sName || '',
            arrivalTime: getVal(['arrival', 'arrivaltime', 'arr']) || '00:00',
            departureTime: getVal(['departure', 'departuretime', 'dep']) || '00:00',
            haltTime: parseInt(getVal(['halt', 'halttime', 'haltm'])) || 0,
            distance: parseInt(getVal(['distance', 'dist', 'distkm'])) || 0,
            day: parseInt(getVal(['day'])) || 1
          };
        });

        if (newSchedule.length > 0) {
          let tNo = '';
          const match = file.name.match(/\d{5}/);
          if (match) tNo = match[0];

          setActiveTrain({
            trainNo: tNo || 'Uploaded',
            trainName: file.name.replace('.csv', ''),
            schedule: newSchedule
          });
          setStartStation('');
          setEndStation('');
          setTimetableUploadError(null);
        } else {
          setTimetableUploadError("No valid schedule data found in CSV.");
        }
        setIsTimetableUploading(false);
      },
      error: (err) => {
        setTimetableUploadError("Error parsing Timetable CSV.");
        setIsTimetableUploading(false);
      }
    });
  };

  // Analysis Logic
  const analysis = useMemo(() => {
    if (!activeTrain || !startStation || !endStation || rtisData.length === 0) return null;

    const startIndex = activeTrain.schedule.findIndex(s => (s.stationCode || s.stationName) === startStation);
    const endIndex = activeTrain.schedule.findIndex(s => (s.stationCode || s.stationName) === endStation);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return null;

    const startSched = activeTrain.schedule[startIndex];
    const endSched = activeTrain.schedule[endIndex];

    // Calculate Scheduled Duration
    // Simplified: assuming same day or next day based on 'day' field
    const schedStart = parse(startSched.departureTime, 'HH:mm', new Date());
    const schedEnd = parse(endSched.arrivalTime, 'HH:mm', new Date());
    let schedDuration = differenceInMinutes(schedEnd, schedStart);
    if (endSched.day > startSched.day) {
      schedDuration += (endSched.day - startSched.day) * 24 * 60;
    }

    // Find Actual Times from RTIS Data
    // We look for the first occurrence of the station in RTIS data
    const actualStartRecord = rtisData.find(r => r.station === startSched.stationCode || r.station === startSched.stationName);
    const actualEndRecord = rtisData.find(r => r.station === endSched.stationCode || r.station === endSched.stationName);

    if (!actualStartRecord || !actualEndRecord) {
      return { error: "RTIS data does not contain both selected stations." };
    }

    const actualStart = new Date(actualStartRecord.timestamp);
    const actualEnd = new Date(actualEndRecord.timestamp);
    const actualDuration = differenceInMinutes(actualEnd, actualStart);

    const lossOfRun = actualDuration - schedDuration;

    // Speed Analysis between sections
    const sectionData = rtisData.filter(r => {
      const t = new Date(r.timestamp);
      return t >= actualStart && t <= actualEnd;
    });

    const maxSpeed = Math.max(...sectionData.map(r => r.speed));
    const avgSpeed = sectionData.reduce((acc, curr) => acc + curr.speed, 0) / sectionData.length;

    // Halt Analysis
    const haltsInRange = activeTrain.schedule.slice(startIndex, endIndex + 1).map(s => {
      // Try to find actual halt in RTIS
      const stationRecords = rtisData.filter(r => r.station === s.stationCode || r.station === s.stationName);
      let actualHalt = 0;
      if (stationRecords.length > 1) {
        const arrival = new Date(stationRecords[0].timestamp);
        const departure = new Date(stationRecords[stationRecords.length - 1].timestamp);
        actualHalt = differenceInMinutes(departure, arrival);
      }
      return {
        station: s.stationName,
        scheduled: s.haltTime,
        actual: actualHalt,
        diff: actualHalt - s.haltTime
      };
    });

    // Section-wise Analysis (Every two stations)
    const sectionWiseAnalysis = [];
    for (let i = startIndex; i < endIndex; i++) {
      const s1 = activeTrain.schedule[i];
      const s2 = activeTrain.schedule[i + 1];

      const r1 = rtisData.find(r => r.station === s1.stationCode || r.station === s1.stationName);
      const r2 = rtisData.find(r => r.station === s2.stationCode || r.station === s2.stationName);

      if (r1 && r2) {
        const t1Sched = parse(s1.departureTime, 'HH:mm', new Date());
        const t2Sched = parse(s2.arrivalTime, 'HH:mm', new Date());
        let sDuration = differenceInMinutes(t2Sched, t1Sched);
        if (s2.day > s1.day) sDuration += (s2.day - s1.day) * 24 * 60;

        const t1Act = new Date(r1.timestamp);
        const t2Act = new Date(r2.timestamp);
        const aDuration = differenceInMinutes(t2Act, t1Act);

        sectionWiseAnalysis.push({
          from: s1.stationName,
          to: s2.stationName,
          sched: sDuration,
          actual: aDuration,
          diff: aDuration - sDuration
        });
      }
    }

    return {
      schedDuration,
      actualDuration,
      lossOfRun,
      maxSpeed,
      avgSpeed,
      haltsInRange,
      sectionData,
      sectionWiseAnalysis
    };
  }, [activeTrain, startStation, endStation, rtisData]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* API Key Warning Banner */}
      {isApiKeyMissing && (
        <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2 sticky top-0 z-50">
          <AlertCircle className="w-4 h-4" />
          <span>Gemini API Key is missing. Search functionality will not work.</span>
          <button 
            onClick={() => alert("Go to Settings -> Secrets in AI Studio and add GEMINI_API_KEY.")}
            className="underline ml-2 hover:text-amber-100"
          >
            How to fix?
          </button>
        </div>
      )}
      {/* Manual Input Modal */}
      <ManualTrainModal 
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        onSave={(data) => {
          setActiveTrain(data);
          setStartStation('');
          setEndStation('');
        }}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Train className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-indigo-900">RailRun Analyst</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <input 
              type="text" 
              placeholder={rateLimitCountdown > 0 ? `Wait ${rateLimitCountdown}s...` : "Enter Train No (e.g. 12301)"}
              className={`pl-10 pr-4 py-2 border border-gray-300 rounded-full text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all w-64 ${rateLimitCountdown > 0 ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              value={trainNo}
              onChange={(e) => setTrainNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              disabled={rateLimitCountdown > 0}
            />
            <Train className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${rateLimitCountdown > 0 ? 'text-gray-300' : 'text-gray-400'}`} />
            {isSearchingTrain && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600"></div>
              </div>
            )}
          </div>
          <button 
            onClick={() => setIsManualModalOpen(true)}
            className="text-indigo-600 border border-indigo-600 px-4 py-2 rounded-full text-sm font-semibold hover:bg-indigo-50 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Manual Input
          </button>
          <button 
            onClick={() => {
              setTrainNo('12301');
              handleSearch();
            }}
            className="text-indigo-600 border border-indigo-600 px-4 py-2 rounded-full text-sm font-semibold hover:bg-indigo-50 transition-colors"
          >
            Sample Train
          </button>
          <button 
            onClick={handleSearch}
            disabled={isSearchingTrain}
            className="bg-indigo-600 text-white px-6 py-2 rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSearchingTrain ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Searching...
              </>
            ) : (
              "Search"
            )}
          </button>
        </div>
        {searchStatus && (
          <div className="mt-2 text-center">
            <p className="text-xs text-indigo-600 font-medium animate-pulse">
              {searchStatus}
            </p>
          </div>
        )}
        <div className="mt-4 flex flex-col items-center gap-2">
          <div className="flex justify-center gap-4 text-[10px] text-gray-400">
            <p>Try: 12301 (Rajdhani), 12002 (Shatabdi), 12423 (Dibrugarh Rajdhani)</p>
          </div>
          <p className="text-[8px] text-gray-300">v1.0.6</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Panel: Configuration & Upload */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Timetable Upload Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-lg">Train Timetable</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">Upload the Train Timetable CSV file or use the search bar above.</p>
            
            <input 
              type="file" 
              ref={timetableFileInputRef} 
              className="hidden" 
              accept=".csv" 
              onChange={handleTimetableUpload}
            />
            
            <button 
              onClick={() => timetableFileInputRef.current?.click()}
              className={cn(
                "w-full border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-indigo-400 hover:bg-indigo-50 transition-all group",
                activeTrain && "border-indigo-300 bg-indigo-50",
                timetableUploadError && "border-red-300 bg-red-50"
              )}
            >
              {isTimetableUploading ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              ) : activeTrain ? (
                <>
                  <div className="bg-indigo-100 p-3 rounded-full">
                    <Train className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-indigo-700">{activeTrain.trainNo} - {activeTrain.trainName}</p>
                    <p className="text-xs text-indigo-600">{activeTrain.schedule.length} stations loaded</p>
                  </div>
                </>
              ) : timetableUploadError ? (
                <>
                  <div className="bg-red-100 p-3 rounded-full">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-red-700">Upload Failed</p>
                    <p className="text-xs text-red-600 px-4">{timetableUploadError}</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-gray-100 p-3 rounded-full group-hover:bg-indigo-100 transition-colors">
                    <Upload className="w-6 h-6 text-gray-400 group-hover:text-indigo-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-700">Upload Timetable CSV</p>
                    <p className="text-xs text-gray-400">Standard IR format</p>
                  </div>
                </>
              )}
            </button>
          </div>

          {/* File Upload Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-lg">RTIS Data</h2>
            </div>
            <p className="text-sm text-gray-500 mb-6">Upload the RTIS CSV file containing GPS logs and speed data for analysis.</p>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".csv" 
              onChange={handleFileUpload}
            />
            
            <button 
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "w-full border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center gap-3 hover:border-indigo-400 hover:bg-indigo-50 transition-all group",
                rtisData.length > 0 && "border-green-300 bg-green-50",
                uploadError && "border-red-300 bg-red-50"
              )}
            >
              {isUploading ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              ) : rtisData.length > 0 ? (
                <>
                  <div className="bg-green-100 p-3 rounded-full">
                    <Upload className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-green-700">File Uploaded</p>
                    <p className="text-xs text-green-600">{rtisData.length} records found</p>
                  </div>
                </>
              ) : uploadError ? (
                <>
                  <div className="bg-red-100 p-3 rounded-full">
                    <AlertCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-red-700">Upload Failed</p>
                    <p className="text-xs text-red-600 px-4">Check columns & format</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-gray-100 p-3 rounded-full group-hover:bg-indigo-100 transition-colors">
                    <Upload className="w-6 h-6 text-gray-400 group-hover:text-indigo-600" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-gray-700">Click to upload CSV</p>
                    <p className="text-xs text-gray-400">RTIS standard format</p>
                  </div>
                </>
              )}
            </button>
            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-600 whitespace-pre-line">{uploadError}</p>
              </div>
            )}
          </div>

          {/* Station Selection Card */}
          <div className={cn(
            "bg-white rounded-2xl p-6 border border-gray-200 shadow-sm transition-opacity",
            !activeTrain && "opacity-50 pointer-events-none"
          )}>
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-lg">Section Analysis</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">From Station</label>
                <select 
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  value={startStation}
                  onChange={(e) => setStartStation(e.target.value)}
                >
                  <option value="">Select Station</option>
                  {activeTrain?.schedule.map((s, idx) => (
                    <option key={s.stationCode || s.stationName || idx} value={s.stationCode || s.stationName}>
                      {s.stationName}{s.stationCode && s.stationCode.trim() && s.stationCode !== s.stationName ? ` (${s.stationCode.trim()})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <div className="bg-gray-100 p-2 rounded-full">
                  <ChevronRight className="w-4 h-4 text-gray-400 rotate-90" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">To Station</label>
                <select 
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                  value={endStation}
                  onChange={(e) => setEndStation(e.target.value)}
                >
                  <option value="">Select Station</option>
                  {activeTrain?.schedule.map((s, idx) => (
                    <option key={s.stationCode || s.stationName || idx} value={s.stationCode || s.stationName}>
                      {s.stationName}{s.stationCode && s.stationCode.trim() && s.stationCode !== s.stationName ? ` (${s.stationCode.trim()})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Help Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-lg">Setup & Environment</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-800 font-bold mb-1">Environment Variables Required:</p>
                <code className="text-[10px] block bg-white/50 p-1 rounded">GEMINI_API_KEY</code>
              </div>
              
              <div className="space-y-2">
                <p className="font-bold text-xs uppercase text-gray-400">In AI Studio:</p>
                <p className="text-xs">Go to <strong>Settings</strong> &rarr; <strong>Secrets</strong> and add <code>GEMINI_API_KEY</code>.</p>
              </div>

              <div className="space-y-2">
                <p className="font-bold text-xs uppercase text-gray-400">In Vercel:</p>
                <p className="text-xs">Go to <strong>Project Settings</strong> &rarr; <strong>Environment Variables</strong>. Add <code>GEMINI_API_KEY</code> to all environments (Production, Preview, Development).</p>
              </div>

              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <p className="text-xs text-indigo-700">
                  <strong>Tip:</strong> You can now search for <strong>any real train number</strong> in the header to fetch its actual timetable.
                </p>
              </div>
            </div>
          </div>

          {/* Train Info Card */}
          {activeTrain && (
            <div className="bg-indigo-900 rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
              <div className="absolute -right-4 -bottom-4 opacity-10">
                <Train className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <p className="text-indigo-300 text-xs font-bold uppercase tracking-widest mb-1">Active Train</p>
                <h3 className="text-2xl font-bold mb-1">{activeTrain.trainName}</h3>
                <p className="text-indigo-200 text-sm mb-6">#{activeTrain.trainNo}</p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                    <p className="text-[10px] text-indigo-300 uppercase font-bold">Origin</p>
                    <p className="font-semibold text-sm">{activeTrain.schedule[0].stationCode || activeTrain.schedule[0].stationName}</p>
                  </div>
                  <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                    <p className="text-[10px] text-indigo-300 uppercase font-bold">Destination</p>
                    <p className="font-semibold text-sm">{activeTrain.schedule[activeTrain.schedule.length - 1].stationCode || activeTrain.schedule[activeTrain.schedule.length - 1].stationName}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Dashboard */}
        <div className="lg:col-span-8 space-y-6">
          
          {!activeTrain || !startStation || !endStation || rtisData.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center justify-center text-center min-h-[600px]">
              <div className="bg-indigo-50 p-6 rounded-full mb-6">
                <Info className="w-12 h-12 text-indigo-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Ready for Analysis</h2>
              <p className="text-gray-500 max-w-md">
                Search for a train, upload your RTIS CSV file, and select the start and end stations to begin the performance analysis.
              </p>
              <div className="mt-8 flex gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                  <span>1. Search Train</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                  <span>2. Upload RTIS</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
                  <span>3. Select Section</span>
                </div>
              </div>
            </div>
          ) : analysis?.error ? (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 flex items-center gap-4 text-red-700">
              <AlertCircle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-lg">Analysis Error</h3>
                <p>{analysis.error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-orange-100 p-2 rounded-lg">
                      <Clock className="w-5 h-5 text-orange-600" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Loss of Run</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h4 className={cn(
                      "text-3xl font-bold",
                      analysis!.lossOfRun > 0 ? "text-red-600" : "text-green-600"
                    )}>
                      {Math.abs(analysis!.lossOfRun)}
                    </h4>
                    <span className="text-gray-400 text-sm font-medium">mins</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {analysis!.lossOfRun > 0 ? "Delayed compared to schedule" : "Gained compared to schedule"}
                  </p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <Zap className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Max Speed</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h4 className="text-3xl font-bold text-blue-600">{analysis!.maxSpeed.toFixed(1)}</h4>
                    <span className="text-gray-400 text-sm font-medium">km/h</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Highest speed achieved in section</p>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-green-100 p-2 rounded-lg">
                      <TrendingUp className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avg Speed</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <h4 className="text-3xl font-bold text-green-600">{analysis!.avgSpeed.toFixed(1)}</h4>
                    <span className="text-gray-400 text-sm font-medium">km/h</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Average speed across section</p>
                </div>
              </div>

              {/* Speed Chart */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    Speed Profile
                  </h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                      <span className="text-xs text-gray-500">Speed (km/h)</span>
                    </div>
                  </div>
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analysis!.sectionData}>
                      <defs>
                        <linearGradient id="colorSpeed" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="timestamp" 
                        hide 
                      />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false}
                        tickFormatter={(val) => `${val}`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        labelFormatter={(label) => format(new Date(label), 'HH:mm:ss')}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="speed" 
                        stroke="#6366f1" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorSpeed)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Section-wise Loss of Run */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <TrendingDown className="w-5 h-5 text-indigo-600" />
                    Section-wise Analysis
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-4">Section</th>
                        <th className="px-6 py-4">Sched Time</th>
                        <th className="px-6 py-4">Actual Time</th>
                        <th className="px-6 py-4">Diff</th>
                        <th className="px-6 py-4">Performance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {analysis!.sectionWiseAnalysis.map((sec, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm">{sec.from}</span>
                              <ChevronRight className="w-3 h-3 text-gray-300" />
                              <span className="font-semibold text-sm">{sec.to}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">{sec.sched}m</td>
                          <td className="px-6 py-4 text-sm text-gray-700 font-medium">{sec.actual}m</td>
                          <td className={cn(
                            "px-6 py-4 text-sm font-bold",
                            sec.diff > 0 ? "text-red-500" : sec.diff < 0 ? "text-green-500" : "text-gray-400"
                          )}>
                            {sec.diff > 0 ? `+${sec.diff}` : sec.diff}m
                          </td>
                          <td className="px-6 py-4">
                            <div className="w-24 bg-gray-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full",
                                  sec.diff > 0 ? "bg-red-400" : "bg-green-400"
                                )}
                                style={{ width: `${Math.min(100, (Math.abs(sec.diff) / sec.sched) * 200)}%` }}
                              ></div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Halt Analysis Table */}
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-600" />
                    Halt Performance
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        <th className="px-6 py-4">Station</th>
                        <th className="px-6 py-4">Scheduled Halt</th>
                        <th className="px-6 py-4">Actual Halt</th>
                        <th className="px-6 py-4">Difference</th>
                        <th className="px-6 py-4">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {analysis!.haltsInRange.map((halt, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-semibold text-sm">{halt.station}</td>
                          <td className="px-6 py-4 text-sm text-gray-500">{halt.scheduled} mins</td>
                          <td className="px-6 py-4 text-sm text-gray-700 font-medium">{halt.actual} mins</td>
                          <td className={cn(
                            "px-6 py-4 text-sm font-bold",
                            halt.diff > 0 ? "text-red-500" : halt.diff < 0 ? "text-green-500" : "text-gray-400"
                          )}>
                            {halt.diff > 0 ? `+${halt.diff}` : halt.diff} mins
                          </td>
                          <td className="px-6 py-4">
                            {halt.diff > 0 ? (
                              <span className="bg-red-100 text-red-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Overstay</span>
                            ) : halt.diff < 0 ? (
                              <span className="bg-green-100 text-green-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase">Quick</span>
                            ) : (
                              <span className="bg-gray-100 text-gray-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase">On Time</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section Comparison */}
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                  <TrendingDown className="w-5 h-5 text-indigo-600" />
                  Time Analysis
                </h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500 font-medium">Scheduled Duration</span>
                      <span className="font-bold">{analysis!.schedDuration} mins</span>
                    </div>
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                      <div className="bg-indigo-400 h-full" style={{ width: '100%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-gray-500 font-medium">Actual Duration</span>
                      <span className="font-bold">{analysis!.actualDuration} mins</span>
                    </div>
                    <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full",
                          analysis!.lossOfRun > 0 ? "bg-red-500" : "bg-green-500"
                        )} 
                        style={{ width: `${(analysis!.actualDuration / analysis!.schedDuration) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <div className="mt-8 p-4 bg-indigo-50 rounded-xl border border-indigo-100 flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-600 mt-0.5" />
                  <p className="text-sm text-indigo-900 leading-relaxed">
                    The train took <strong>{analysis!.actualDuration} minutes</strong> to cover the section from {activeTrain.schedule.find(s => s.stationCode === startStation)?.stationName} to {activeTrain.schedule.find(s => s.stationCode === endStation)?.stationName}. 
                    This resulted in a <strong>{analysis!.lossOfRun > 0 ? 'loss' : 'gain'} of {Math.abs(analysis!.lossOfRun)} minutes</strong> compared to the official schedule.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto p-6 text-center text-gray-400 text-xs border-t border-gray-200 mt-12">
        <p>© 2026 RailRun Analyst • Real-time Train Information System Analysis Tool</p>
      </footer>
    </div>
  );
}

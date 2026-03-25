/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
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
  AlertCircle
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

// ... existing types ...

/**
 * Robust date parser for common Indian Railways formats
 */
const parseRTISDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  
  // Try standard ISO
  let d = new Date(dateStr);
  if (isValid(d)) return d;

  // Try DD-MM-YYYY HH:mm:ss
  try {
    d = parse(dateStr, 'dd-MM-yyyy HH:mm:ss', new Date());
    if (isValid(d)) return d;
  } catch (e) {}

  // Try DD/MM/YYYY HH:mm:ss
  try {
    d = parse(dateStr, 'dd/MM/yyyy HH:mm:ss', new Date());
    if (isValid(d)) return d;
  } catch (e) {}

  return null;
};

interface ScheduleItem {
  stationName: string;
  stationCode: string;
  arrivalTime: string;
  departureTime: string;
  haltTime: number; // in minutes
  distance: number;
  day: number;
}

interface TrainData {
  trainNo: string;
  trainName: string;
  schedule: ScheduleItem[];
}

// Mock Data Source for Train Timetables
// In a real app, this would be an API call
const MOCK_TRAINS: Record<string, TrainData> = {
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

export default function App() {
  const [trainNo, setTrainNo] = useState('');
  const [activeTrain, setActiveTrain] = useState<TrainData | null>(null);
  const [rtisData, setRtisData] = useState<RTISRecord[]>([]);
  const [startStation, setStartStation] = useState('');
  const [endStation, setEndStation] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Train Search
  const handleSearch = () => {
    if (MOCK_TRAINS[trainNo]) {
      setActiveTrain(MOCK_TRAINS[trainNo]);
      setStartStation('');
      setEndStation('');
    } else {
      alert("Train not found in mock database. Try 12301 or 12002.");
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      complete: (results) => {
        const mappedData = results.data.map((row: any) => {
          const rawTime = row.timestamp || row.Time || row.TIMESTAMP || row.time || '';
          const parsedDate = parseRTISDate(String(rawTime));
          
          return {
            timestamp: parsedDate ? parsedDate.toISOString() : '',
            lat: row.lat || row.Latitude || row.LAT || 0,
            lon: row.lon || row.Longitude || row.LON || 0,
            speed: row.speed || row.Speed || row.SPEED || 0,
            station: row.station || row.Station || row.STATION_CODE || row.STN || undefined
          };
        }).filter(r => r.timestamp);

        if (mappedData.length === 0) {
          alert("No valid records found. Please check CSV columns (timestamp, speed, station).");
        } else {
          setRtisData(mappedData as RTISRecord[]);
        }
        setIsUploading(false);
      },
      error: (err) => {
        console.error("CSV Parse Error:", err);
        alert("Error parsing CSV file.");
        setIsUploading(false);
      }
    });
  };

  const loadDemoData = () => {
    setTrainNo('12301');
    setActiveTrain(MOCK_TRAINS['12301']);
    
    // Generate some fake RTIS data for demo
    const demoRecords: RTISRecord[] = [];
    const schedule = MOCK_TRAINS['12301'].schedule;
    const baseDate = new Date();
    baseDate.setHours(16, 0, 0, 0);

    schedule.forEach((s, idx) => {
      const schedTime = parse(s.arrivalTime === "00:00" ? s.departureTime : s.arrivalTime, 'HH:mm', baseDate);
      // Add some delay for demo
      const actualTime = new Date(schedTime.getTime() + (idx * 5 * 60000)); 
      
      // Add station arrival
      demoRecords.push({
        timestamp: actualTime.toISOString(),
        lat: 0, lon: 0, speed: 0,
        station: s.stationCode
      });

      // Add some moving records between stations
      if (idx < schedule.length - 1) {
        for (let i = 1; i <= 5; i++) {
          const moveTime = new Date(actualTime.getTime() + (i * 10 * 60000));
          demoRecords.push({
            timestamp: moveTime.toISOString(),
            lat: 0, lon: 0, speed: 80 + (Math.random() * 40),
            station: undefined
          });
        }
      }
    });

    setRtisData(demoRecords);
    setStartStation('HWH');
    setEndStation('NDLS');
  };

  // Analysis Logic
  const analysis = useMemo(() => {
    if (!activeTrain || !startStation || !endStation || rtisData.length === 0) return null;

    const startIndex = activeTrain.schedule.findIndex(s => s.stationCode === startStation);
    const endIndex = activeTrain.schedule.findIndex(s => s.stationCode === endStation);

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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Train className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-indigo-900">RailRun Analyst</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter Train No (e.g. 12301)" 
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-full text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all w-64"
              value={trainNo}
              onChange={(e) => setTrainNo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Train className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
          <button 
            onClick={loadDemoData}
            className="text-indigo-600 border border-indigo-600 px-4 py-2 rounded-full text-sm font-semibold hover:bg-indigo-50 transition-colors"
          >
            Demo Mode
          </button>
          <button 
            onClick={handleSearch}
            className="bg-indigo-600 text-white px-6 py-2 rounded-full text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Search
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Panel: Configuration & Upload */}
        <div className="lg:col-span-4 space-y-6">
          
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
                rtisData.length > 0 && "border-green-300 bg-green-50"
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
                  {activeTrain?.schedule.map(s => (
                    <option key={s.stationCode} value={s.stationCode}>{s.stationName} ({s.stationCode})</option>
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
                  {activeTrain?.schedule.map(s => (
                    <option key={s.stationCode} value={s.stationCode}>{s.stationName} ({s.stationCode})</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Help Card */}
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-5 h-5 text-indigo-600" />
              <h2 className="font-bold text-lg">Help & Format</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>To use this tool, your CSV should have these columns:</p>
              <ul className="list-disc pl-5 space-y-1 text-xs">
                <li><strong>timestamp</strong>: Date and time (DD-MM-YYYY HH:mm:ss)</li>
                <li><strong>speed</strong>: Current speed in km/h</li>
                <li><strong>station</strong>: Station code (optional, for halt analysis)</li>
              </ul>
              <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                <p className="text-xs text-indigo-700">
                  <strong>Tip:</strong> Use "Demo Mode" in the header to see a sample analysis with pre-loaded data.
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
                    <p className="font-semibold text-sm">{activeTrain.schedule[0].stationCode}</p>
                  </div>
                  <div className="bg-white/10 p-3 rounded-xl backdrop-blur-sm">
                    <p className="text-[10px] text-indigo-300 uppercase font-bold">Destination</p>
                    <p className="font-semibold text-sm">{activeTrain.schedule[activeTrain.schedule.length - 1].stationCode}</p>
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

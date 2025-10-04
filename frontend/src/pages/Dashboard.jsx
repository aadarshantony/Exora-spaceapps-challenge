// src/components/Dashboard.jsx

import React, { useState, useEffect } from "react";
import { Toaster } from "react-hot-toast";

import MapSection from "./MapSection";
import ControlPanel from "./ControlPanel";
import ForecastDisplay from "./ForecastDisplay";

import { fetchWeatherForecast, downloadPDF, getWeatherImplications, convertSvgToImage, captureAllCharts, generateForecast, generateNormalDistribution, generateTimeSeriesData } from "../utils/forecastUtils";
import { weatherVars, getUnit, getVarInfo } from "../constants/weatherVariables";

export default function Dashboard() {
  const [location, setLocation] = useState(null);
  const [targetDate, setTargetDate] = useState("");
  const [variables, setVariables] = useState(["precipitation"]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historicalData, setHistoricalData] = useState(null);
  const [timeSeriesData, setTimeSeriesData] = useState(null);

  const toggleVariable = (id) => {
    setVariables(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const handleDownloadPDF = async () => {
    // This is where you would pass the necessary data and helper functions to the downloadPDF utility
    await downloadPDF(forecast, location, targetDate, weatherVars, getUnit, getVarInfo, getWeatherImplications, convertSvgToImage, captureAllCharts);
  };

  useEffect(() => {
    if (location && targetDate && variables.length > 0) {
      const timer = setTimeout(() => {
        fetchWeatherForecast(location, targetDate, variables, setForecast, setHistoricalData, setTimeSeriesData, setLoading);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [location, targetDate, variables]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-white p-4">
      <Toaster position="top-right" />
      
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8 pt-6">
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            NASA Climate Forecaster
          </h1>
          <p className="text-slate-300 text-lg">Advanced weather prediction using historical NASA data</p>
        </header>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <ControlPanel
              targetDate={targetDate}
              setTargetDate={setTargetDate}
              variables={variables}
              toggleVariable={toggleVariable}
              downloadPDF={handleDownloadPDF}
              forecast={forecast}
            />
            <MapSection location={location} setLocation={setLocation} />
          </div>
          
          <div className="lg:col-span-2 space-y-6">
            <ForecastDisplay
              forecast={forecast}
              timeSeriesData={timeSeriesData}
              loading={loading}
              location={location}
              targetDate={targetDate}
            />
          </div>
        </div>

        <footer className="mt-8 text-center text-slate-400 text-sm pb-6">
          <p>Data source: NASA POWER API | Prediction model: Seasonal pattern analysis</p>
        </footer>
      </div>
    </div>
  );
}
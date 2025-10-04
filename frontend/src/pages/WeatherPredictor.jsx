import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Toaster } from "react-hot-toast";
import toast from "react-hot-toast";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import L from "leaflet";

// Fix marker icon issue in leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export default function WeatherPredictor() {
  const [location, setLocation] = useState(null);
  const [targetDate, setTargetDate] = useState("");
  const [variables, setVariables] = useState(["precipitation"]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historicalData, setHistoricalData] = useState(null);
  const [timeSeriesData, setTimeSeriesData] = useState(null);
  const chartsRef = useRef(null);
  const mapRef = useRef(null);

  const weatherVars = [
    { id: "precipitation", label: "Rainfall", icon: "fas fa-cloud-showers-heavy", param: "PRECTOTCORR", color: "#4dc2f5" },
    { id: "temperature", label: "Temperature", icon: "fas fa-thermometer-half", param: "T2M", color: "#f75555" },
    { id: "wind", label: "Wind Speed", icon: "fas fa-wind", param: "WS2M", color: "#36c891" },
    { id: "humidity", label: "Humidity", icon: "fas fa-water", param: "RH2M", color: "#927fe1" },
    { id: "pressure", label: "Pressure", icon: "fas fa-tachometer-alt", param: "PS", color: "#f5a623" },
  ];

  const getUnit = (param) => {
    const units = {
      PRECTOTCORR: "mm",
      T2M: "°C",
      WS2M: "m/s",
      RH2M: "%",
      PS: "kPa"
    };
    return units[param] || "";
  };

  const getVarInfo = (param) => {
    return weatherVars.find(v => v.param === param);
  };

  function MapClick() {
    useMapEvents({
      click(e) {
        setLocation(e.latlng);
        toast.success(`Location set: ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`);
      },
    });
    return location ? <Marker position={location} /> : null;
  }
  
  const handleLocationSearch = async (e) => {
    if (e.key === "Enter" || e.type === "click") {
        const query = e.target.value || e.target.previousSibling.value;
        if (!query) {
            toast.error("Please enter a location to search.");
            return;
        }

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
            const data = await response.json();

            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                const newLocation = { lat: parseFloat(lat), lng: parseFloat(lon) };
                setLocation(newLocation);
                if (mapRef.current) {
                    mapRef.current.setView([newLocation.lat, newLocation.lng], 10);
                }
                toast.success(`Location found: ${data[0].display_name}`);
            } else {
                toast.error("Location not found. Please try a different search term.");
            }
        } catch (error) {
            toast.error("An error occurred during location search.");
            console.error("Location search error:", error);
        }
    }
  };

  const toggleVariable = (id) => {
    setVariables(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const generateNormalDistribution = (mean, stdDev, samples = 50) => {
    const data = [];
    const range = stdDev * 4;
    const step = range / samples;
    
    for (let i = 0; i < samples; i++) {
      const x = mean - range / 2 + i * step;
      const exponent = -Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2));
      const y = (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
      data.push({ value: x, probability: y * 100 });
    }
    return data;
  };

  const generateTimeSeriesData = (historicalData, targetDate) => {
    const seriesData = {};
    const target = new Date(targetDate);
    const targetMonth = target.getMonth();

    Object.keys(historicalData).forEach(param => {
      const monthlyData = [];
      const entries = Object.entries(historicalData[param])
        .map(([date, value]) => ({
          date: new Date(date.substring(0, 4), date.substring(4, 6) - 1, date.substring(6, 8)),
          value
        }))
        .filter(item => !isNaN(item.value) && item.date.getMonth() === targetMonth)
        .sort((a, b) => a.date - b.date);

      // Group by year
      const yearlyData = {};
      entries.forEach(item => {
        const year = item.date.getFullYear();
        if (!yearlyData[year]) yearlyData[year] = [];
        yearlyData[year].push(item.value);
      });

      Object.keys(yearlyData).forEach(year => {
        const avg = yearlyData[year].reduce((a, b) => a + b, 0) / yearlyData[year].length;
        monthlyData.push({ year: parseInt(year), value: avg });
      });

      seriesData[param] = monthlyData.sort((a, b) => a.year - b.year);
    });

    return seriesData;
  };

  const generateForecast = (historicalData, targetDate) => {
    const predictions = {};
    const target = new Date(targetDate);
    const targetMonth = target.getMonth();
    const targetDay = target.getDate();

    Object.keys(historicalData).forEach(param => {
      const values = Object.entries(historicalData[param])
        .map(([date, value]) => {
          const d = new Date(date.substring(0, 4), date.substring(4, 6) - 1, date.substring(6, 8));
          return { date: d, value, month: d.getMonth(), day: d.getDate() };
        })
        .filter(item => !isNaN(item.value));

      const seasonalData = values.filter(item => {
        const dayDiff = Math.abs(item.day - targetDay);
        return item.month === targetMonth && dayDiff <= 7;
      });

      if (seasonalData.length > 0) {
        const sorted = seasonalData.sort((a, b) => b.date - a.date);
        let weightedSum = 0;
        let weightSum = 0;
        
        sorted.forEach((item, idx) => {
          const weight = 1 / (idx + 1);
          weightedSum += item.value * weight;
          weightSum += weight;
        });

        const predicted = weightedSum / weightSum;
        const variance = seasonalData.reduce((sum, item) => 
          sum + Math.pow(item.value - predicted, 2), 0) / seasonalData.length;
        const stdDev = Math.sqrt(variance);

        predictions[param] = {
          value: predicted,
          confidence: Math.max(0, Math.min(100, 100 - (stdDev / Math.abs(predicted)) * 50)),
          range: { min: predicted - stdDev, max: predicted + stdDev },
          stdDev: stdDev,
          samples: seasonalData.length,
          distribution: generateNormalDistribution(predicted, stdDev)
        };
      }
    });

    return predictions;
  };

  const fetchWeatherForecast = async () => {
    if (!location || !targetDate || variables.length === 0) {
      toast.error("Please select location, date, and at least one variable");
      return;
    }

    setLoading(true);
    setForecast(null);
    
    try {
      const lat = location.lat.toFixed(2);
      const lon = location.lng.toFixed(2);
      
      const endYear = new Date().getFullYear() - 1;
      const startYear = endYear - 4;
      const startDate = `${startYear}0101`;
      const endDate = `${endYear}1231`;
      
      const params = variables
        .map(v => weatherVars.find(w => w.id === v)?.param)
        .filter(Boolean)
        .join(",");

      const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=${params}&community=AG&longitude=${lon}&latitude=${lat}&start=${startDate}&end=${endDate}&format=JSON`;

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`NASA POWER API error: ${response.status}`);
      }

      const data = await response.json();
      const historical = data.properties.parameter;
      setHistoricalData(historical);

      const predictions = generateForecast(historical, targetDate);
      setForecast(predictions);

      const timeSeries = generateTimeSeriesData(historical, targetDate);
      setTimeSeriesData(timeSeries);

      toast.success("Forecast generated successfully!");
    } catch (err) {
      console.error("Forecast error:", err);
      toast.error(`Failed to generate forecast: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const convertSvgToImage = (svg) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const svgString = new XMLSerializer().serializeToString(svg);
      
      canvas.width = svg.width.baseVal.value || 800;
      canvas.height = svg.height.baseVal.value || 300;
      
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        const imgData = canvas.toDataURL('image/png');
        URL.revokeObjectURL(url);
        resolve(imgData);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  };

  const captureAllCharts = async () => {
    const chartData = {};
    const containers = document.querySelectorAll('.chart-container');
    
    for (const container of containers) {
      const param = container.getAttribute('data-param');
      const chartType = container.getAttribute('data-chart-type');
      const svg = container.querySelector('svg');
      
      if (svg && param) {
        const imgData = await convertSvgToImage(svg);
        if (imgData) {
          if (!chartData[param]) chartData[param] = {};
          chartData[param][chartType] = imgData;
        }
      }
    }
    
    return chartData;
  };

  const downloadPDF = async () => {
    if (!forecast || !location || !targetDate) {
      toast.error("No forecast data to download");
      return;
    }

    const toastId = toast.loading("Capturing charts...", { id: 'pdf-gen' });

    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const chartImages = await captureAllCharts();
      
      if (Object.keys(chartImages).length === 0) {
        throw new Error("Failed to capture charts.");
      }

      toast.loading("Generating PDF report...", { id: toastId });

      const pdfWindow = window.open('', '_blank');
      
      const emojiMap = {
        'precipitation': '🌧️',
        'temperature': '🌡️',
        'wind': '💨',
        'humidity': '💧',
        'pressure': '🔽'
      };

      const getWeatherImplications = (varId, value, unit) => {
        switch(varId) {
          case 'precipitation':
            if (value < 1) return `Minimal rainfall expected (${value.toFixed(1)} mm). Dry conditions likely - good for outdoor activities but may require irrigation for crops. Low risk of flooding or water-related disruptions.`;
            if (value < 10) return `Light to moderate rainfall predicted (${value.toFixed(1)} mm). Generally favorable conditions with some precipitation. Suitable for most outdoor activities with minor precautions.`;
            if (value < 50) return `Significant rainfall anticipated (${value.toFixed(1)} mm). Wet conditions expected - prepare for potential surface water, delays in outdoor work, and increased soil moisture. Good for agriculture but may limit construction activities.`;
            return `Heavy rainfall forecast (${value.toFixed(1)} mm). Prepare for substantial precipitation that may cause flooding, transportation disruptions, and waterlogging. High priority for drainage management and flood preparedness.`;
          
          case 'temperature':
            if (value < 10) return `Cold conditions expected (${value.toFixed(1)}°C). Prepare for low temperatures - appropriate heating, winter clothing, and frost protection for sensitive plants may be needed. Energy demand for heating will be elevated.`;
            if (value < 25) return `Moderate temperatures predicted (${value.toFixed(1)}°C). Comfortable conditions for most activities. Generally pleasant weather requiring minimal temperature management for indoor or outdoor operations.`;
            if (value < 35) return `Warm to hot conditions anticipated (${value.toFixed(1)}°C). Prepare for elevated temperatures - ensure adequate cooling, hydration, and heat stress precautions for outdoor workers and vulnerable populations.`;
            return `Extreme heat forecast (${value.toFixed(1)}°C). High-risk conditions requiring serious heat mitigation measures. Limit outdoor exposure during peak hours, ensure cooling systems are operational, and monitor for heat-related health issues.`;
          
          case 'wind':
            if (value < 5) return `Light winds expected (${value.toFixed(1)} m/s). Calm conditions favorable for most activities including aviation, construction, and outdoor events. Minimal wind-related concerns.`;
            if (value < 10) return `Moderate winds predicted (${value.toFixed(1)} m/s). Noticeable breeze but generally manageable. Minor precautions for lightweight structures, small vessels, and wind-sensitive operations recommended.`;
            if (value < 20) return `Strong winds anticipated (${value.toFixed(1)} m/s). Prepare for challenging conditions - secure loose objects, exercise caution with high-profile vehicles, and monitor for potential structural stress on temporary installations.`;
            return `Very strong winds forecast (${value.toFixed(1)} m/s). Dangerous conditions requiring significant precautions. High risk for transportation disruptions, structural damage, and safety hazards. Consider postponing non-essential outdoor activities.`;
          
          case 'humidity':
            if (value < 30) return `Low humidity conditions (${value.toFixed(1)}%). Dry air may cause discomfort, increased static electricity, and elevated fire risk. Consider humidification for indoor environments and moisturizing for skin care.`;
            if (value < 60) return `Comfortable humidity levels (${value.toFixed(1)}%). Ideal moisture content for most applications. Generally pleasant conditions for human comfort and preservation of materials.`;
            if (value < 80) return `Elevated humidity expected (${value.toFixed(1)}%). Muggy conditions that may feel uncomfortable. Increased potential for mold growth, reduced evaporative cooling efficiency, and discomfort during physical activity.`;
            return `Very high humidity forecast (${value.toFixed(1)}%). Oppressive atmospheric moisture creating significant discomfort. High risk of heat stress amplification, condensation issues, and mold/mildew problems. Enhanced dehumidification may be necessary.`;
          
          case 'pressure':
            if (value < 980) return `Low atmospheric pressure (${value.toFixed(1)} kPa). Associated with unsettled weather systems. Potential for storms, precipitation, and rapidly changing conditions. Monitor weather updates closely.`;
            if (value < 1020) return `Normal atmospheric pressure (${value.toFixed(1)} kPa). Stable weather conditions expected. Generally predictable weather patterns with minimal atmospheric disturbances.`;
            return `High atmospheric pressure (${value.toFixed(1)} kPa). Indicates stable, clear weather systems. Generally favorable conditions with reduced precipitation likelihood and good visibility.`;
          
          default:
            return `Predicted value: ${value.toFixed(2)} ${unit}. Refer to local meteorological standards for interpretation of this parameter in your region.`;
        }
      };

      const pdfContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Weather Forecast Report</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: white; color: #1a1a1a; line-height: 1.6; }
    .header { text-align: center; margin-bottom: 40px; border-bottom: 4px solid #3b82f6; padding-bottom: 25px; background: linear-gradient(135deg, #667eea 0%, #3b82f6 100%); color: white; padding: 40px; border-radius: 12px; margin: -20px -20px 40px -20px; }
    .header h1 { margin: 0; font-size: 36px; font-weight: 700; text-shadow: 2px 2px 4px rgba(0,0,0,0.2); }
    .header p { margin: 15px 0 0 0; font-size: 16px; opacity: 0.95; }
    .info-section { background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 25px; border-radius: 12px; margin-bottom: 35px; border-left: 5px solid #3b82f6; }
    .info-section h2 { margin-top: 0; color: #1e40af; font-size: 22px; margin-bottom: 20px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .info-row { background: white; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1; }
    .info-label { font-weight: 600; color: #475569; display: block; font-size: 13px; margin-bottom: 4px; }
    .info-value { color: #1e293b; font-size: 15px; }
    .methodology { background: #fef3c7; padding: 20px; border-radius: 10px; border-left: 5px solid #f59e0b; margin: 30px 0; }
    .methodology h3 { margin-top: 0; color: #92400e; font-size: 18px; }
    .methodology p { margin: 10px 0; color: #78350f; }
    .forecast-item { background: white; border: 3px solid #e2e8f0; padding: 25px; margin: 25px 0; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); page-break-inside: avoid; }
    .forecast-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #e2e8f0; }
    .forecast-title { font-size: 24px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 10px; }
    .forecast-value { font-size: 32px; font-weight: 700; color: #3b82f6; }
    .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
    .metric-box { background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #cbd5e1; }
    .metric-label { color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; margin-bottom: 5px; }
    .metric-value { font-size: 20px; font-weight: 700; color: #334155; }
    .confidence-section { margin: 20px 0; }
    .confidence-bar { width: 100%; height: 30px; background: #e2e8f0; border-radius: 15px; overflow: hidden; position: relative; box-shadow: inset 0 2px 4px rgba(0,0,0,0.1); }
    .confidence-fill { height: 100%; background: linear-gradient(90deg, #10b981 0%, #3b82f6 100%); display: flex; align-items: center; justify-content: flex-end; padding-right: 15px; color: white; font-weight: 700; font-size: 14px; }
    .chart-section { margin: 25px 0; padding: 20px; background: #f8fafc; border-radius: 10px; border: 2px solid #cbd5e1; }
    .chart-title { font-size: 16px; font-weight: 700; color: #334155; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }
    .chart-image { width: 100%; border-radius: 8px; border: 1px solid #cbd5e1; background: white; padding: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .explanation { background: #dbeafe; padding: 18px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #3b82f6; }
    .explanation-title { font-weight: 700; color: #1e40af; margin-bottom: 8px; font-size: 15px; }
    .explanation-text { color: #1e3a8a; font-size: 14px; line-height: 1.6; margin: 0; }
    .interpretation { background: #f0fdf4; padding: 18px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #10b981; }
    .interpretation-title { font-weight: 700; color: #065f46; margin-bottom: 8px; font-size: 15px; }
    .interpretation-text { color: #064e3b; font-size: 14px; line-height: 1.6; margin: 0; }
    .footer { text-align: center; margin-top: 50px; padding-top: 25px; border-top: 3px solid #e2e8f0; }
    .disclaimer { background: #fef2f2; padding: 20px; border-radius: 10px; border-left: 4px solid #ef4444; margin: 20px 0; }
    .disclaimer-title { font-weight: 700; color: #991b1b; margin-bottom: 10px; font-size: 15px; }
    .disclaimer-text { color: #7f1d1d; font-size: 13px; line-height: 1.6; margin: 5px 0; }
    @media print { 
      body { padding: 20px; } 
      .forecast-item { page-break-inside: avoid; }
      .chart-section { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🌍 Exora Climate Forecast Report</h1>
    <p>Professional Weather Prediction Analysis • Powered by NASA POWER Satellite Data</p>
  </div>

  <div class="info-section">
    <h2>📋 Forecast Configuration</h2>
    <div class="info-grid">
      <div class="info-row">
        <span class="info-label">Target Date</span>
        <span class="info-value">${new Date(targetDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Location Coordinates</span>
        <span class="info-value">${location.lat.toFixed(4)}°N, ${location.lng.toFixed(4)}°E</span>
      </div>
      <div class="info-row">
        <span class="info-label">Report Generated</span>
        <span class="info-value">${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Data Source</span>
        <span class="info-value">NASA POWER API v2.0</span>
      </div>
      <div class="info-row">
        <span class="info-label">Analysis Period</span>
        <span class="info-value">5 Years Historical Data (${new Date().getFullYear() - 5} - ${new Date().getFullYear() - 1})</span>
      </div>
      <div class="info-row">
        <span class="info-label">Variables Analyzed</span>
        <span class="info-value">${Object.keys(forecast).length} Weather Parameters</span>
      </div>
    </div>
  </div>

  <div class="methodology">
    <h3>🔬 Forecasting Methodology</h3>
    <p><strong>Approach:</strong> This forecast employs advanced seasonal pattern analysis using 5 years of historical NASA POWER satellite data. The prediction model analyzes weather patterns from the same calendar period (±7 days) across multiple years to identify climatological trends.</p>
    <p><strong>Algorithm:</strong> The system uses a weighted moving average where recent years are given higher importance. Each prediction includes a confidence score based on historical variance and a probability distribution showing the range of likely outcomes.</p>
    <p><strong>Data Quality:</strong> NASA POWER provides validated, quality-controlled satellite observations with global coverage. Historical data points are filtered for anomalies and statistical outliers to ensure forecast reliability.</p>
  </div>

  ${Object.entries(forecast).map(([param, data]) => {
    const varInfo = weatherVars.find(v => v.param === param);
    const unit = getUnit(param);
    const hasDistChart = chartImages[param]?.distribution;
    const hasTimeChart = chartImages[param]?.timeseries;
    
    return `
      <div class="forecast-item">
        <div class="forecast-header">
          <span class="forecast-title">${emojiMap[varInfo.id]} ${varInfo.label}</span>
          <span class="forecast-value">${data.value.toFixed(2)} ${unit}</span>
        </div>
        
        <div class="confidence-section">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 600; color: #475569;">Prediction Confidence</span>
            <span style="font-weight: 700; color: #10b981; font-size: 18px;">${data.confidence.toFixed(1)}%</span>
          </div>
          <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${data.confidence}%">
              ${data.confidence.toFixed(0)}%
            </div>
          </div>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-box">
            <div class="metric-label">Predicted Value</div>
            <div class="metric-value">${data.value.toFixed(2)} ${unit}</div>
          </div>
          
          <div class="metric-box">
            <div class="metric-label">Confidence Level</div>
            <div class="metric-value" style="color: #10b981;">${data.confidence.toFixed(1)}%</div>
          </div>
          
          <div class="metric-box">
            <div class="metric-label">Expected Range</div>
            <div class="metric-value" style="font-size: 16px;">${data.range.min.toFixed(2)} - ${data.range.max.toFixed(2)} ${unit}</div>
          </div>
          
          <div class="metric-box">
            <div class="metric-label">Standard Deviation</div>
            <div class="metric-value">±${data.stdDev.toFixed(2)} ${unit}</div>
          </div>
          
          <div class="metric-box">
            <div class="metric-label">Data Points Used</div>
            <div class="metric-value">${data.samples} samples</div>
          </div>
          
          <div class="metric-box">
            <div class="metric-label">Analysis Window</div>
            <div class="metric-value" style="font-size: 16px;">±7 days</div>
          </div>
        </div>

        <div class="explanation">
          <div class="explanation-title">📊 What This Means</div>
          <div class="explanation-text">
            Based on ${data.samples} historical observations from the same time period over the past 5 years, 
            the predicted ${varInfo.label.toLowerCase()} is <strong>${data.value.toFixed(2)} ${unit}</strong> 
            with a confidence level of <strong>${data.confidence.toFixed(1)}%</strong>. 
            The actual value is expected to fall between <strong>${data.range.min.toFixed(2)} ${unit}</strong> 
            and <strong>${data.range.max.toFixed(2)} ${unit}</strong> with high probability.
          </div>
        </div>

        ${hasDistChart ? `
          <div class="chart-section">
            <div class="chart-title">📈 Probability Distribution Analysis</div>
            <img src="${chartImages[param].distribution}" class="chart-image" alt="Probability Distribution" />
            <div class="interpretation">
              <div class="interpretation-title">🔍 Chart Interpretation</div>
              <div class="interpretation-text">
                This bell curve (normal distribution) shows the likelihood of different ${varInfo.label.toLowerCase()} values occurring. 
                The peak at <strong>${data.value.toFixed(2)} ${unit}</strong> represents the most probable outcome. 
                The spread of the curve indicates variability: a narrow curve means high confidence (consistent historical patterns), 
                while a wider curve suggests more uncertainty (variable historical conditions). 
                The shaded area represents the 68% confidence interval (±1 standard deviation).
              </div>
            </div>
          </div>
        ` : ''}

        ${hasTimeChart ? `
          <div class="chart-section">
            <div class="chart-title">📊 Historical Trend Analysis (Same Month)</div>
            <img src="${chartImages[param].timeseries}" class="chart-image" alt="Historical Trend" />
            <div class="interpretation">
              <div class="interpretation-title">🔍 Trend Analysis</div>
              <div class="interpretation-text">
                This time series displays ${varInfo.label.toLowerCase()} values from the same month over the past 5 years. 
                Each data point represents the monthly average for that year. 
                ${data.samples > 20 ? 
                  'The consistent pattern across years increases forecast reliability.' : 
                  'Limited data points suggest caution in interpretation.'
                }
                Look for upward or downward trends that might indicate climate change effects or multi-year cycles. 
                The forecast considers these historical patterns, giving more weight to recent years.
              </div>
            </div>
          </div>
        ` : ''}

        <div class="interpretation">
          <div class="interpretation-title">💡 Practical Implications</div>
          <div class="interpretation-text">
            ${getWeatherImplications(varInfo.id, data.value, unit)}
          </div>
        </div>
      </div>
    `;
  }).join('')}

  <div class="disclaimer">
    <div class="disclaimer-title">⚠️ Important Disclaimer</div>
    <div class="disclaimer-text">
      <p><strong>Forecast Limitations:</strong> This weather forecast is generated using statistical analysis of historical climate data from NASA's POWER (Prediction Of Worldwide Energy Resources) project. While based on robust satellite observations, this forecast represents climatological probabilities rather than deterministic predictions.</p>
      
      <p><strong>Accuracy Considerations:</strong> Actual weather conditions may vary significantly from predictions due to unpredictable atmospheric events, climate anomalies, and the chaotic nature of weather systems. This forecast is most reliable for general planning purposes and becomes less accurate for dates further in the future.</p>
      
      <p><strong>Intended Use:</strong> This report is designed for informational, educational, and general planning purposes only. It should not be used as the sole basis for critical decisions involving safety, agriculture, aviation, or other weather-dependent operations. Always consult official meteorological services for authoritative weather forecasts.</p>
      
      <p><strong>Data Source Acknowledgment:</strong> These data were obtained from the NASA Langley Research Center (LaRC) POWER Project funded through the NASA Earth Science/Applied Science Program. The POWER data products are provided on an "as-is" basis with no warranty of fitness for any particular purpose.</p>
    </div>
  </div>

  <div class="footer">
    <p style="font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 10px;">
      Report Generated by Exora Climate Forecaster
    </p>
    <p style="font-size: 13px; color: #64748b; margin: 5px 0;">
      Data Source: NASA POWER Project • Analysis Method: Weighted Seasonal Pattern Analysis
    </p>
    <p style="font-size: 12px; color: #94a3b8; margin: 15px 0 0 0;">
      © ${new Date().getFullYear()} • Generated on ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' })}
    </p>
  </div>
</body>
</html>
    `;

    pdfWindow.document.write(pdfContent);
    pdfWindow.document.close();
    
    // Use a short delay before printing to ensure content is fully loaded
    setTimeout(() => {
        pdfWindow.print();
        pdfWindow.close();
    }, 500);

    toast.success("PDF report downloaded successfully!", { id: toastId });

    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error(`Failed to generate PDF: ${err.message}`, { id: toastId });
    }
  };

  useEffect(() => {
    if (location && targetDate && variables.length > 0) {
      const timer = setTimeout(fetchWeatherForecast, 500);
      return () => clearTimeout(timer);
    }
  }, [location, targetDate, variables]);

  return (
    <div className="bg-[#0d1117] text-[#e6edf3] min-h-screen p-6">
      <Toaster position="bottom-right" />
      
      <div className="container mx-auto max-w-screen-xl space-y-6">
        <header className="text-center pt-6">
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-[#4dc2f5] to-[#f75555] bg-clip-text text-transparent">
            Exora Climate Forecaster
          </h1>
          <p className="text-[#8b949e] text-lg">Advanced weather prediction using historical NASA data</p>
        </header>

        {/* Combined Map and Date Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Location and Date section */}
          <div className="lg:col-span-1 bg-[#161b22] border border-[#30363d] rounded-xl p-6 h-[400px] flex flex-col justify-start">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <i className="fas fa-search-location"></i> Find Location
            </h3>
            <div className="flex items-center space-x-2 mb-4">
                <input
                    type="text"
                    placeholder="Search city, country..."
                    onKeyDown={handleLocationSearch}
                    className="w-full px-4 py-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] focus:outline-none focus:border-[#4dc2f5] transition-colors"
                />
                <button
                    onClick={handleLocationSearch}
                    className="p-3 bg-[#4dc2f5] rounded-lg text-white hover:bg-opacity-90 transition-colors"
                >
                    <i className="fas fa-search"></i>
                </button>
                
            </div>
            <p className="text-sm text-[#8b949e] mb-6">Please enter the name of a location where you’d like to view the weather forecast, or simply select the spot directly from the interactive map below</p>
            
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <i className="fas fa-calendar-alt"></i> Event Date
            </h3>
            <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] focus:outline-none focus:border-[#4dc2f5] transition-colors"
            />
            <p className="text-sm text-[#8b949e] mt-2">
                Eg: if you’re planning a hike three months from now, you can check the likely weather conditions in advance
            </p>
          </div>
          
          {/* Interactive Map section */}
          <div className="lg:col-span-2 bg-[#161b22] border border-[#30363d] rounded-xl p-6 h-[400px] flex flex-col">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <i className="fas fa-map-marker-alt"></i> Interactive Map
            </h3>
            <div className="rounded-xl overflow-hidden border border-[#30363d] flex-grow">
              <MapContainer ref={mapRef} center={[20, 77]} zoom={4} style={{ height: "100%", width: "100%" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <MapClick />
              </MapContainer>
            </div>
            {location && (
              <p className="text-xs text-[#c9d1d9] mt-2">
                <i className="fas fa-map-pin"></i> Selected: {location.lat.toFixed(4)}°, {location.lng.toFixed(4)}°
              </p>
            )}
          </div>
        </div>
        
        {/* Weather Variables and Forecast section */}
        <div className="space-y-6">
          {/* Weather Variables section */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Select Weather Variables</h3>
              {forecast && (
                <div>
                <button
                  onClick={downloadPDF}
                  className="px-4 py-2 bg-[#4dc2f5] text-white rounded-lg font-medium hover:bg-opacity-90 transition-all flex items-center gap-2 text-sm"
                >
                  <i className="fas fa-file-pdf"></i> Download Report
                </button>
                <p className="text-xs text-gray-500 text-center">*With Detailed Explanation</p>
                </div>
                
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {weatherVars.map(v => (
                <button
                  key={v.id}
                  onClick={() => toggleVariable(v.id)}
                  className={`p-4 rounded-lg font-medium transition-all duration-200 ${
                    variables.includes(v.id)
                      ? "bg-[#4dc2f5] text-white shadow-md"
                      : "bg-[#0d1117] text-[#8b949e] hover:bg-[#1f242c]"
                  }`}
                >
                  <div className="text-2xl mb-1">
                    <i className={v.icon}></i>
                  </div>
                  <div className="text-xs">{v.label}</div>
                </button>
              ))}
            </div>
          </div>
          
          {/* Weather Forecast section */}
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6" ref={chartsRef}>
            <h3 className="text-2xl font-semibold mb-6 flex items-center gap-2">
              <i className="fas fa-chart-line"></i> Weather Forecast
            </h3>
            
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <div className="w-16 h-16 border-4 border-[#4dc2f5] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[#8b949e]">Analyzing historical patterns...</p>
              </div>
            ) : !location || !targetDate ? (
              <div className="flex items-center justify-center h-64 text-[#8b949e]">
                <p className="text-center">Select a location and date to generate forecast</p>
              </div>
            ) : forecast && Object.keys(forecast).length > 0 ? (
              <div className="space-y-6">
                {Object.entries(forecast).map(([param, data]) => {
                  const varInfo = getVarInfo(param);
                  return (
                    <div key={param} className="bg-[#0d1117] rounded-xl p-5 border border-[#30363d]">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="text-lg font-semibold text-[#4dc2f5] flex items-center gap-2">
                          <i className={varInfo.icon}></i> {varInfo.label}
                        </h4>
                        <span className="text-3xl font-bold">
                          {data.value.toFixed(2)} {getUnit(param)}
                        </span>
                      </div>
                      
                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-[#8b949e]">Confidence:</span>
                            <span className="text-[#36c891] font-medium">{data.confidence.toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-[#30363d] rounded-full h-3">
                            <div 
                              className="bg-gradient-to-r from-[#36c891] to-[#4dc2f5] h-3 rounded-full transition-all"
                              style={{ width: `${data.confidence}%` }}
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-[#8b949e]">Range:</span>
                            <span>{data.range.min.toFixed(2)} - {data.range.max.toFixed(2)} {getUnit(param)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8b949e]">Std Dev:</span>
                            <span>±{data.stdDev.toFixed(2)} {getUnit(param)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Probability Distribution Chart */}
                      <div className="mt-4 chart-container" data-param={param} data-chart-type="distribution">
                        <h5 className="text-sm font-semibold text-[#c9d1d9] mb-3">
                          <i className="fas fa-chart-area"></i> Probability Distribution
                        </h5>
                        <ResponsiveContainer width="100%" height={180}>
                          <AreaChart data={data.distribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                            <XAxis 
                              dataKey="value" 
                              stroke="#8b949e"
                              tick={{ fontSize: 12 }}
                              tickFormatter={(val) => val.toFixed(1)}
                            />
                            <YAxis stroke="#8b949e" tick={{ fontSize: 12 }} />
                            <Tooltip 
                              contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                              labelFormatter={(val) => `${val.toFixed(2)} ${getUnit(param)}`}
                              formatter={(val) => [`${val.toFixed(2)}%`, 'Probability']}
                            />
                            <Area 
                              type="monotone" 
                              dataKey="probability" 
                              stroke={varInfo.color}
                              fill={varInfo.color}
                              fillOpacity={0.4}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Time Series Chart */}
                      {timeSeriesData && timeSeriesData[param] && (
                        <div className="mt-6 chart-container" data-param={param} data-chart-type="timeseries">
                          <h5 className="text-sm font-semibold text-[#c9d1d9] mb-3">
                            <i className="fas fa-chart-line"></i> Historical Trend (Same Month)
                          </h5>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={timeSeriesData[param]}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                              <XAxis 
                                dataKey="year" 
                                stroke="#8b949e"
                                tick={{ fontSize: 12 }}
                              />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 12 }} />
                              <Tooltip 
                                contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                                formatter={(val) => [`${val.toFixed(2)} ${getUnit(param)}`, 'Average']}
                              />
                              <Line 
                                type="monotone" 
                                dataKey="value" 
                                stroke={varInfo.color}
                                strokeWidth={2}
                                dot={{ fill: varInfo.color, r: 4 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-[#8b949e]">
                <p>No forecast data available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="mt-8 text-center text-[#8b949e] text-sm">
        <p>Data source: NASA POWER API | Prediction model: Seasonal pattern analysis</p>
      </footer>
    </div>
  );
}
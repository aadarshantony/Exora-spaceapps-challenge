import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import toast from "react-hot-toast";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import L from "leaflet";
import { jsPDF } from "jspdf";

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
  const [timeSeriesData, setTimeSeriesData] = useState(null);
  const mapRef = useRef(null);

  const weatherVars = [
    { id: "precipitation", label: "Rainfall", icon: "fas fa-cloud-showers-heavy", param: "PRECTOTCORR", color: "#4dc2f5" },
    { id: "temperature", label: "Temperature", icon: "fas fa-thermometer-half", param: "T2M", color: "#f75555" },
    { id: "wind", label: "Wind Speed", icon: "fas fa-wind", param: "WS2M", color: "#36c891" },
    { id: "humidity", label: "Humidity", icon: "fas fa-water", param: "RH2M", color: "#927fe1" },
    { id: "pressure", label: "Pressure", icon: "fas fa-tachometer-alt", param: "PS", color: "#f5a623" },
  ];

  const getUnit = (param) => {
    const units = { PRECTOTCORR: "mm", T2M: "°C", WS2M: "m/s", RH2M: "%", PS: "kPa" };
    return units[param] || "";
  };

  const getVarInfo = (param) => weatherVars.find(v => v.param === param);

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
    setVariables(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
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

      if (!response.ok) throw new Error(`NASA POWER API error: ${response.status}`);

      const data = await response.json();
      const historical = data.properties.parameter;

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

  const getWeatherImplications = (varId, value, unit) => {
    switch (varId) {
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

  const getDisplayStatus = (varId, value) => {
    switch (varId) {
      case 'precipitation':
        if (value < 1) return { text: 'Dry conditions - Good for outdoor activities', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
        if (value < 10) return { text: 'Light rainfall - Generally favorable', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
        if (value < 50) return { text: 'Wet conditions - Prepare for surface water', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
        return { text: 'Heavy rain - Flooding risk, take precautions', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'temperature':
        if (value < 10) return { text: 'Cold - Winter clothing and heating needed', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
        if (value < 25) return { text: 'Comfortable - Pleasant for most activities', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
        if (value < 35) return { text: 'Hot - Stay hydrated and limit sun exposure', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
        return { text: 'Extreme heat - Health risk, stay indoors', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'wind':
        if (value < 5) return { text: 'Calm - Ideal for all outdoor activities', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
        if (value < 10) return { text: 'Breezy - Minor precautions needed', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
        if (value < 20) return { text: 'Strong winds - Secure loose objects', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
        return { text: 'Dangerous winds - Stay indoors if possible', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'humidity':
        if (value < 30) return { text: 'Dry air - May cause discomfort, fire risk', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
        if (value < 60) return { text: 'Comfortable - Ideal moisture levels', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
        if (value < 80) return { text: 'Muggy - Uncomfortable, mold risk increases', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
        return { text: 'Very humid - Oppressive conditions, health concerns', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
      case 'pressure':
        if (value < 980) return { text: 'Low pressure - Storms possible, monitor weather', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
        if (value < 1020) return { text: 'Normal pressure - Stable weather expected', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
        return { text: 'High pressure - Clear, stable conditions', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
      default:
        return { text: 'Conditions require interpretation', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' };
    }
  };

  const downloadCSV = () => {
    if (!forecast || !location || !targetDate) {
      toast.error("No forecast data to download");
      return;
    }

    try {
      const rows = [];
      
      // Header row
      rows.push([
        'Variable',
        'Parameter Code',
        'Predicted Value',
        'Unit',
        'Confidence (%)',
        'Range Min',
        'Range Max',
        'Standard Deviation',
        'Samples Used',
        'Status',
        'Location Lat',
        'Location Lng',
        'Target Date',
        'Report Generated',
        'Data Source',
        'Source URL'
      ]);

      // Data rows
      Object.entries(forecast).forEach(([param, data]) => {
        const varInfo = getVarInfo(param);
        const unit = getUnit(param);
        const statusInfo = getDisplayStatus(varInfo.id, data.value);
        
        rows.push([
          varInfo.label,
          param,
          data.value.toFixed(4),
          unit,
          data.confidence.toFixed(2),
          data.range.min.toFixed(4),
          data.range.max.toFixed(4),
          data.stdDev.toFixed(4),
          data.samples,
          statusInfo.text,
          location.lat.toFixed(6),
          location.lng.toFixed(6),
          targetDate,
          new Date().toISOString(),
          'NASA POWER API',
          'https://power.larc.nasa.gov/'
        ]);
      });

      // Convert to CSV string
      const csvContent = rows.map(row => 
        row.map(cell => {
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      ).join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Weather-Forecast-${targetDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("CSV file downloaded successfully!");
    } catch (err) {
      console.error("CSV generation error:", err);
      toast.error(`Failed to generate CSV: ${err.message}`);
    }
  };

  const downloadJSON = () => {
    if (!forecast || !location || !targetDate) {
      toast.error("No forecast data to download");
      return;
    }

    try {
      const exportData = {
        metadata: {
          generatedAt: new Date().toISOString(),
          targetDate: targetDate,
          location: {
            latitude: location.lat,
            longitude: location.lng,
            coordinates: `${location.lat.toFixed(6)}°N, ${location.lng.toFixed(6)}°E`
          },
          dataSource: {
            name: "NASA POWER API",
            url: "https://power.larc.nasa.gov/api/pages/",
            apiEndpoint: "https://power.larc.nasa.gov/api/temporal/daily/point",
            documentation: "https://power.larc.nasa.gov/docs/"
          },
          methodology: {
            approach: "Seasonal pattern analysis using 5 years of historical satellite data",
            algorithm: "Weighted moving average with recent years prioritized",
            analysisWindow: "±7 days from target date",
            description: "Historical weather patterns from the same calendar period are analyzed to identify trends and generate predictions"
          },
          analysisParameters: {
            startYear: new Date().getFullYear() - 5,
            endYear: new Date().getFullYear() - 1,
            totalYears: 5,
            dataPoints: Object.values(forecast).reduce((sum, data) => sum + data.samples, 0)
          }
        },
        forecasts: []
      };

      Object.entries(forecast).forEach(([param, data]) => {
        const varInfo = getVarInfo(param);
        const unit = getUnit(param);
        const statusInfo = getDisplayStatus(varInfo.id, data.value);
        
        exportData.forecasts.push({
          variable: {
            name: varInfo.label,
            id: varInfo.id,
            parameterCode: param,
            icon: varInfo.icon,
            color: varInfo.color
          },
          prediction: {
            value: parseFloat(data.value.toFixed(4)),
            unit: unit,
            confidence: parseFloat(data.confidence.toFixed(2)),
            confidenceLevel: data.confidence > 80 ? "High" : data.confidence > 60 ? "Medium" : "Low"
          },
          statistics: {
            range: {
              minimum: parseFloat(data.range.min.toFixed(4)),
              maximum: parseFloat(data.range.max.toFixed(4)),
              unit: unit
            },
            standardDeviation: parseFloat(data.stdDev.toFixed(4)),
            variance: parseFloat(Math.pow(data.stdDev, 2).toFixed(4)),
            samplesUsed: data.samples,
            confidenceInterval: `${data.range.min.toFixed(2)} - ${data.range.max.toFixed(2)} ${unit}`
          },
          interpretation: {
            status: statusInfo.text,
            implications: getWeatherImplications(varInfo.id, data.value, unit),
            category: data.confidence > 80 ? "High Confidence" : data.confidence > 60 ? "Moderate Confidence" : "Lower Confidence"
          },
          distributionData: data.distribution.map(point => ({
            value: parseFloat(point.value.toFixed(4)),
            probability: parseFloat(point.probability.toFixed(4)),
            unit: unit
          }))
        });
      });

      // Add time series data if available
      if (timeSeriesData) {
        exportData.historicalTrends = {};
        Object.entries(timeSeriesData).forEach(([param, data]) => {
          const varInfo = getVarInfo(param);
          exportData.historicalTrends[param] = {
            variable: varInfo.label,
            parameterCode: param,
            unit: getUnit(param),
            description: `Historical yearly averages for ${new Date(targetDate).toLocaleString('default', { month: 'long' })}`,
            yearlyAverages: data.map(point => ({
              year: point.year,
              value: parseFloat(point.value.toFixed(4)),
              unit: getUnit(param)
            }))
          };
        });
      }

      exportData.license = {
        notice: "Data provided by NASA POWER API Project, And the code to analyze the forecast data is mdae by AI",
        terms: "Please acknowledge NASA POWER API when using this data",
        moreInfo: "https://power.larc.nasa.gov/data-access-viewer/"
      };

      // Create and download file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Weather-Forecast-${targetDate}.json`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("JSON file downloaded successfully!");
    } catch (err) {
      console.error("JSON generation error:", err);
      toast.error(`Failed to generate JSON: ${err.message}`);
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

  const getWeatherStatus = (varId, value) => {
    switch (varId) {
      case 'precipitation':
        if (value < 1) return { status: 'Dry conditions - Good for outdoor activities', color: [16, 185, 129] };
        if (value < 10) return { status: 'Light rainfall - Generally favorable', color: [34, 197, 94] };
        if (value < 50) return { status: 'Wet conditions - Prepare for surface water', color: [234, 179, 8] };
        return { status: 'Heavy rain - Flooding risk, take precautions', color: [239, 68, 68] };
      case 'temperature':
        if (value < 10) return { status: 'Cold - Winter clothing and heating needed', color: [59, 130, 246] };
        if (value < 25) return { status: 'Comfortable - Pleasant for most activities', color: [16, 185, 129] };
        if (value < 35) return { status: 'Hot - Stay hydrated and limit sun exposure', color: [234, 179, 8] };
        return { status: 'Extreme heat - Health risk, stay indoors', color: [239, 68, 68] };
      case 'wind':
        if (value < 5) return { status: 'Calm - Ideal for all outdoor activities', color: [16, 185, 129] };
        if (value < 10) return { status: 'Breezy - Minor precautions needed', color: [34, 197, 94] };
        if (value < 20) return { status: 'Strong winds - Secure loose objects', color: [234, 179, 8] };
        return { status: 'Dangerous winds - Stay indoors if possible', color: [239, 68, 68] };
      case 'humidity':
        if (value < 30) return { status: 'Dry air - May cause discomfort, fire risk', color: [234, 179, 8] };
        if (value < 60) return { status: 'Comfortable - Ideal moisture levels', color: [16, 185, 129] };
        if (value < 80) return { status: 'Muggy - Uncomfortable, mold risk increases', color: [234, 179, 8] };
        return { status: 'Very humid - Oppressive conditions, health concerns', color: [239, 68, 68] };
      case 'pressure':
        if (value < 980) return { status: 'Low pressure - Storms possible, monitor weather', color: [234, 179, 8] };
        if (value < 1020) return { status: 'Normal pressure - Stable weather expected', color: [16, 185, 129] };
        return { status: 'High pressure - Clear, stable conditions', color: [59, 130, 246] };
      default:
        return { status: 'Conditions require interpretation', color: [107, 114, 128] };
    }
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

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - 2 * margin;
      let yPos = margin;

      const checkPageBreak = (heightNeeded) => {
        if (yPos + heightNeeded > pageHeight - margin) {
          doc.addPage();
          yPos = margin;
          return true;
        }
        return false;
      };

      const addHeader = (text) => {
        checkPageBreak(10);
        doc.setFillColor(59, 130, 246);
        doc.rect(margin, yPos, contentWidth, 8, 'F');
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(text, margin + 3, yPos + 5.5);
        yPos += 12;
        doc.setTextColor(0, 0, 0);
      };

      const addBox = (content) => {
        const boxHeight = content.length * 5 + 8;
        checkPageBreak(boxHeight);
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, yPos, contentWidth, boxHeight, 'F');
        doc.setDrawColor(203, 213, 225);
        doc.rect(margin, yPos, contentWidth, boxHeight, 'S');
        yPos += 4;
        content.forEach(item => {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(71, 85, 105);
          doc.text(item.label + ':', margin + 3, yPos);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(30, 41, 59);
          doc.text(item.value, margin + 50, yPos);
          yPos += 5;
        });
        yPos += 6;
      };

      doc.setFillColor(102, 126, 234);
      doc.rect(0, 0, pageWidth, 50, 'F');
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('Exora Climate Forecast Report', pageWidth / 2, 25, { align: 'center' });
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Professional Weather Prediction Analysis', pageWidth / 2, 35, { align: 'center' });
      doc.text('Powered by NASA POWER Satellite Data', pageWidth / 2, 42, { align: 'center' });
      yPos = 60;

      addHeader('Forecast Configuration');
      addBox([
        { label: 'Target Date', value: new Date(targetDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) },
        { label: 'Location', value: `${location.lat.toFixed(4)}°N, ${location.lng.toFixed(4)}°E` },
        { label: 'Report Generated', value: new Date().toLocaleDateString('en-US', { dateStyle: 'full' }) },
        { label: 'Data Source', value: 'NASA POWER API' },
        { label: 'Analysis Period', value: `5 Years (${new Date().getFullYear() - 5} - ${new Date().getFullYear() - 1})` },
        { label: 'Variables Analyzed', value: `${Object.keys(forecast).length} Weather Parameters` }
      ]);

      addHeader('Forecasting Methodology');
      doc.setFillColor(254, 243, 199);
      const methodologyHeight = 35;
      checkPageBreak(methodologyHeight);
      doc.rect(margin, yPos, contentWidth, methodologyHeight, 'F');
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(1);
      doc.line(margin, yPos, margin, yPos + methodologyHeight);
      yPos += 5;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(146, 64, 14);
      doc.text('Approach:', margin + 3, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 53, 15);
      const approachText = doc.splitTextToSize('This forecast employs seasonal pattern analysis using 5 years of NASA POWER satellite data. The model analyzes weather patterns from the same calendar period (±7 days) to identify trends.', contentWidth - 6);
      doc.text(approachText, margin + 3, yPos);
      yPos += approachText.length * 4 + 5;
      doc.setFont('helvetica', 'bold');
      doc.text('Algorithm:', margin + 3, yPos);
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      const algoText = doc.splitTextToSize('Weighted moving average where recent years have higher importance. Confidence scores based on historical variance.', contentWidth - 6);
      doc.text(algoText, margin + 3, yPos);
      yPos += algoText.length * 4 + 8;

      for (const [param, data] of Object.entries(forecast)) {
        const varInfo = weatherVars.find(v => v.param === param);
        const unit = getUnit(param);
        const statusInfo = getWeatherStatus(varInfo.id, data.value);
        
        checkPageBreak(15);
        
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, yPos, contentWidth, 12, 'F');
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.5);
        doc.rect(margin, yPos, contentWidth, 12, 'S');
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(varInfo.label, margin + 3, yPos + 7);
        
        doc.setFontSize(18);
        doc.setTextColor(59, 130, 246);
        doc.text(`${data.value.toFixed(2)} ${unit}`, pageWidth - margin - 3, yPos + 8, { align: 'right' });
        yPos += 15;

        checkPageBreak(10);
        doc.setFillColor(...statusInfo.color);
        const statusWidth = doc.getTextWidth(statusInfo.status) + 8;
        doc.roundedRect(margin, yPos, statusWidth, 7, 1.5, 1.5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text(statusInfo.status, margin + 4, yPos + 5);
        yPos += 12;

        checkPageBreak(12);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text('Prediction Confidence', margin, yPos);
        doc.setTextColor(16, 185, 129);
        doc.setFontSize(11);
        doc.text(`${data.confidence.toFixed(1)}%`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 5;
        
        doc.setFillColor(226, 232, 240);
        doc.roundedRect(margin, yPos, contentWidth, 5, 2, 2, 'F');
        doc.setFillColor(16, 185, 129);
        const confWidth = (contentWidth * data.confidence) / 100;
        doc.roundedRect(margin, yPos, confWidth, 5, 2, 2, 'F');
        yPos += 10;

        checkPageBreak(25);
        const metricsData = [
          ['Predicted Value', `${data.value.toFixed(2)} ${unit}`],
          ['Confidence Level', `${data.confidence.toFixed(1)}%`],
          ['Expected Range', `${data.range.min.toFixed(2)} - ${data.range.max.toFixed(2)} ${unit}`],
          ['Standard Deviation', `±${data.stdDev.toFixed(2)} ${unit}`],
          ['Data Points Used', `${data.samples} samples`],
          ['Analysis Window', '±7 days']
        ];

        for (let i = 0; i < metricsData.length; i += 2) {
          checkPageBreak(12);
          for (let j = 0; j < 2 && i + j < metricsData.length; j++) {
            const xOffset = j * (contentWidth / 2);
            doc.setFillColor(248, 250, 252);
            doc.rect(margin + xOffset, yPos, contentWidth / 2 - 2, 10, 'F');
            doc.setDrawColor(203, 213, 225);
            doc.rect(margin + xOffset, yPos, contentWidth / 2 - 2, 10, 'S');
            
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(100, 116, 139);
            doc.text(metricsData[i + j][0], margin + xOffset + 2, yPos + 4);
            
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(51, 65, 85);
            doc.text(metricsData[i + j][1], margin + xOffset + 2, yPos + 8);
          }
          yPos += 12;
        }

        checkPageBreak(20);
        doc.setFillColor(219, 234, 254);
        const explainText = doc.splitTextToSize(
          `Based on ${data.samples} historical observations, the predicted ${varInfo.label.toLowerCase()} is ${data.value.toFixed(2)} ${unit} with ${data.confidence.toFixed(1)}% confidence. The actual value is expected to fall between ${data.range.min.toFixed(2)} ${unit} and ${data.range.max.toFixed(2)} ${unit}.`,
          contentWidth - 6
        );
        const explainHeight = explainText.length * 4 + 8;
        checkPageBreak(explainHeight);
        doc.rect(margin, yPos, contentWidth, explainHeight, 'F');
        doc.setDrawColor(59, 130, 246);
        doc.setLineWidth(1);
        doc.line(margin, yPos, margin, yPos + explainHeight);
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 64, 175);
        doc.text('What This Means', margin + 3, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 58, 138);
        doc.text(explainText, margin + 3, yPos);
        yPos += explainText.length * 4 + 3;

        if (chartImages[param]?.distribution) {
          checkPageBreak(65);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(51, 65, 85);
          doc.text('Probability Distribution Analysis', margin, yPos);
          yPos += 5;
          doc.addImage(chartImages[param].distribution, 'PNG', margin, yPos, contentWidth, 55);
          yPos += 60;
        }

        if (chartImages[param]?.timeseries) {
          checkPageBreak(65);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(51, 65, 85);
          doc.text('Historical Trend Analysis (Same Month)', margin, yPos);
          yPos += 5;
          doc.addImage(chartImages[param].timeseries, 'PNG', margin, yPos, contentWidth, 55);
          yPos += 60;
        }

        checkPageBreak(20);
        doc.setFillColor(240, 253, 244);
        const implicationText = doc.splitTextToSize(
          getWeatherImplications(varInfo.id, data.value, unit),
          contentWidth - 6
        );
        const implicationHeight = implicationText.length * 4 + 8;
        checkPageBreak(implicationHeight);
        doc.rect(margin, yPos, contentWidth, implicationHeight, 'F');
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(1);
        doc.line(margin, yPos, margin, yPos + implicationHeight);
        yPos += 4;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(6, 95, 70);
        doc.text('Practical Implications', margin + 3, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(6, 78, 59);
        doc.text(implicationText, margin + 3, yPos);
        yPos += implicationText.length * 4 + 8;
      }

      doc.addPage();
      yPos = margin;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(153, 27, 27);
      doc.text('Important Disclaimer', margin, yPos);
      yPos += 7;
      
      const disclaimerSections = [
        { title: 'Forecast Limitations:', text: 'This forecast uses statistical analysis of NASA POWER historical data. It represents climatological probabilities rather than deterministic predictions.' },
        { title: 'Accuracy Considerations:', text: 'Actual conditions may vary due to unpredictable atmospheric events and the chaotic nature of weather systems.' },
        { title: 'Intended Use:', text: 'For informational and planning purposes only. Consult official meteorological services for critical decisions.' }
      ];

      disclaimerSections.forEach(section => {
        checkPageBreak(15);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(section.title, margin, yPos);
        yPos += 4;
        doc.setFont('helvetica', 'normal');
        const text = doc.splitTextToSize(section.text, contentWidth);
        doc.text(text, margin, yPos);
        yPos += text.length * 4 + 3;
      });

      yPos = pageHeight - 20;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(51, 65, 85);
      doc.text('Report Generated by Exora Climate Forecaster', pageWidth / 2, yPos, { align: 'center' });
      yPos += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text('Data Source: NASA POWER Project | Weighted Seasonal Pattern Analysis', pageWidth / 2, yPos, { align: 'center' });

      doc.save(`Weather-Forecast-${targetDate}.pdf`);
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
      <div className="container mx-auto max-w-screen-xl space-y-6">
        <header className="text-center pt-6">
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-[#4dc2f5] to-[#f75555] bg-clip-text text-transparent">
            Exora Climate Forecaster
          </h1>
          <p className="text-[#8b949e] text-lg">Advanced weather prediction using historical NASA data</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
            <p className="text-sm text-[#8b949e] mb-6">Please enter the name of a location where you'd like to view the weather forecast, or simply select the spot directly from the interactive map below</p>

            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <i className="fas fa-calendar-alt"></i> Event Date
            </h3>
            <div className="relative w-full">
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full px-4 py-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] focus:outline-none focus:border-[#4dc2f5] transition-colors opacity-0 absolute inset-0 z-10"
              />
              <div className="w-full px-4 py-3 bg-[#0d1117] border border-[#30363d] rounded-lg text-sm text-[#e6edf3] flex items-center justify-between pointer-events-none">
                <span>{targetDate || "Select a date"}</span>
                <i className="fas fa-calendar-alt text-[#4dc2f5]"></i>
              </div>
            </div>
            <p className="text-sm text-[#8b949e] mt-2">
              Eg: if you're planning a hike three months from now, you can check the likely weather conditions in advance
            </p>
          </div>

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

        <div className="space-y-6">
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Select Weather Variables</h3>
              {forecast && (
                <div className="flex gap-2">
                  <button
                    onClick={downloadPDF}
                    className="px-4 py-2 bg-[#4dc2f5] text-white rounded-lg font-medium hover:bg-opacity-90 transition-all flex items-center gap-2 text-sm"
                  >
                    <i className="fas fa-file-pdf"></i> PDF
                  </button>
                  <button
                    onClick={downloadCSV}
                    className="px-4 py-2 bg-[#36c891] text-white rounded-lg font-medium hover:bg-opacity-90 transition-all flex items-center gap-2 text-sm"
                  >
                    <i className="fas fa-file-csv"></i> CSV
                  </button>
                  <button
                    onClick={downloadJSON}
                    className="px-4 py-2 bg-[#927fe1] text-white rounded-lg font-medium hover:bg-opacity-90 transition-all flex items-center gap-2 text-sm"
                  >
                    <i className="fas fa-file-code"></i> JSON
                  </button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {weatherVars.map(v => (
                <button
                  key={v.id}
                  onClick={() => toggleVariable(v.id)}
                  className={`p-4 rounded-lg font-medium transition-all duration-200 ${variables.includes(v.id)
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

          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6">
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
                  const unit = getUnit(param);
                  const statusInfo = getDisplayStatus(varInfo.id, data.value);

                  return (
                    <div key={param} className="bg-[#0d1117] rounded-xl p-5 border border-[#30363d]">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="text-lg font-semibold text-[#4dc2f5] flex items-center gap-2">
                          <i className={varInfo.icon}></i> {varInfo.label}
                        </h4>
                        <span className="text-3xl font-bold">
                          {data.value.toFixed(2)} {unit}
                        </span>
                      </div>

                      <div className={`mb-4 px-3 py-2 rounded-lg border inline-block ${statusInfo.color}`}>
                        <span className="text-sm font-medium">{statusInfo.text}</span>
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
                            <span>{data.range.min.toFixed(2)} - {data.range.max.toFixed(2)} {unit}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8b949e]">Std Dev:</span>
                            <span>±{data.stdDev.toFixed(2)} {unit}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 chart-container" data-param={param} data-chart-type="distribution">
                        <h5 className="text-sm font-semibold text-[#c9d1d9] mb-3">
                          <i className="fas fa-chart-area"></i> Probability Distribution
                        </h5>
                        <ResponsiveContainer width="100%" height={180}>
                          <AreaChart data={data.distribution} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
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
                              labelFormatter={(val) => `${val.toFixed(2)} ${unit}`}
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

                      {timeSeriesData && timeSeriesData[param] && (
                        <div className="mt-6 chart-container" data-param={param} data-chart-type="timeseries">
                          <h5 className="text-sm font-semibold text-[#c9d1d9] mb-3">
                            <i className="fas fa-chart-line"></i> Historical Trend (Same Month)
                          </h5>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={timeSeriesData[param]} margin={{ top: 0, right: 0, left: -15, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
                              <XAxis
                                dataKey="year"
                                stroke="#8b949e"
                                tick={{ fontSize: 12 }}
                              />
                              <YAxis stroke="#8b949e" tick={{ fontSize: 12 }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '8px' }}
                                formatter={(val) => [`${val.toFixed(2)} ${unit}`, 'Average']}
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
        <p>Data source: NASA POWER API | Prediction model: Seasonal pattern analysis | The code for prediction / forecasting is written by AI</p>
      </footer>
    </div>
  );
}
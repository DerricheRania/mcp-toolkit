import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import https from "https";

// Helper: replaces fetch() with native https module
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("Invalid JSON response")); }
      });
    }).on("error", reject);
  });
}

function codeToDesc(code) {
  if (code === 0)  return "☀️  Clear sky";
  if (code <= 2)   return "🌤️  Partly cloudy";
  if (code === 3)  return "☁️  Overcast";
  if (code <= 49)  return "🌫️  Foggy";
  if (code <= 57)  return "🌦️  Drizzle";
  if (code <= 67)  return "🌧️  Rain";
  if (code <= 77)  return "❄️  Snow";
  if (code <= 82)  return "🌦️  Rain showers";
  if (code <= 86)  return "🌨️  Snow showers";
  if (code >= 95)  return "⛈️  Thunderstorm";
  return "🌡️  Unknown";
}

// Create the MCP Server
const server = new McpServer({ name: "weather-mcp", version: "1.0.0" });

// TOOL: get_weather
server.tool(
  "get_weather",
  "Get current weather and 3-day forecast for any city. Free, no API key needed.",
  {
    city: z.string().describe("City name, e.g. Algiers, Paris, London"),
    units: z.enum(["metric", "imperial"]).default("metric").describe("metric=°C, imperial=°F"),
  },
  async ({ city, units }) => {
    try {
      const geoData = await httpGet(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
      );

      if (!geoData.results || geoData.results.length === 0) {
        return { content: [{ type: "text", text: `❌ City "${city}" not found.` }] };
      }

      const { name, country, latitude, longitude } = geoData.results[0];
      const tempUnit = units === "imperial" ? "fahrenheit" : "celsius";
      const windUnit = units === "imperial" ? "mph" : "kmh";

      const w = await httpGet(
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_sum` +
        `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}` +
        `&forecast_days=4&timezone=auto`
      );

      const deg = units === "imperial" ? "°F" : "°C";
      const spd = units === "imperial" ? "mph" : "km/h";

      let result = `🌍 Weather for ${name}, ${country}\n`;
      result += `${"─".repeat(35)}\n`;
      result += `🌤️  Now:        ${codeToDesc(w.current.weather_code)}\n`;
      result += `🌡️  Temp:       ${w.current.temperature_2m}${deg} (feels like ${w.current.apparent_temperature}${deg})\n`;
      result += `💧 Humidity:   ${w.current.relative_humidity_2m}%\n`;
      result += `💨 Wind:       ${w.current.wind_speed_10m} ${spd}\n\n`;
      result += `📅 3-Day Forecast:\n`;

      for (let i = 1; i <= 3; i++) {
        const date = new Date(w.daily.time[i]).toLocaleDateString("en-US", {
          weekday: "long", month: "short", day: "numeric",
        });
        const rain = w.daily.precipitation_sum[i];
        result += `  ${date}\n`;
        result += `    ${codeToDesc(w.daily.weather_code[i])}\n`;
        result += `    Min: ${w.daily.temperature_2m_min[i]}${deg}  Max: ${w.daily.temperature_2m_max[i]}${deg}`;
        result += rain > 0 ? `  🌧️ Rain: ${rain}mm\n` : `\n`;
      }

      return { content: [{ type: "text", text: result }] };

    } catch (err) {
      return { content: [{ type: "text", text: `❌ Error: ${err.message}` }] };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("✅ Weather MCP server running...");

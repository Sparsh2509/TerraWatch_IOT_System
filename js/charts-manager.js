/**
 * TerraWatch - Real-Time Charts Manager
 * Powers the 4 geotechnical time-series charts using Chart.js.
 * Supports smooth streaming updates, custom dark theme gradients, dynamic threshold markers, and tooltips.
 */

class ChartsManager {
  constructor(configManager) {
    this.config = configManager || window.TerraWatchConfig;
    this.charts = {};
    this.historyBuffer = []; // array of readings { timestamp, soil_moisture, tilt, vibration, rain }
    this.maxPoints = SYSTEM_CONFIG.CHART_MAX_POINTS || 60;
  }

  init() {
    this.initSoilMoistureChart();
    this.initTiltChart();
    this.initVibrationChart();
    this.initRainChart();

    // Re-render threshold lines if config changes
    window.addEventListener('terrawatch:thresholds_changed', () => {
      this.updateThresholdLines();
    });
  }

  getCommonOptions(title, unit, yMin, yMax, warnVal, critVal) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 300,
        easing: 'easeOutQuart'
      },
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            boxWidth: 10,
            color: '#94a3b8',
            font: { family: "'Inter', sans-serif", size: 11 }
          }
        },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 10,
          displayColors: true,
          callbacks: {
            label: function (context) {
              return ` ${context.dataset.label}: ${context.parsed.y} ${unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(51, 65, 85, 0.25)',
            drawBorder: false
          },
          ticks: {
            color: '#64748b',
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 6
          }
        },
        y: {
          min: yMin,
          max: yMax,
          grid: {
            color: 'rgba(51, 65, 85, 0.3)',
            drawBorder: false
          },
          ticks: {
            color: '#64748b',
            font: { family: "'JetBrains Mono', monospace", size: 10 },
            callback: (val) => `${val}${unit}`
          }
        }
      }
    };
  }

  initSoilMoistureChart() {
    const ctx = document.getElementById('chart-soil-moisture')?.getContext('2d');
    if (!ctx) return;

    const t = this.config.thresholds.soil_moisture;
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    this.charts.soil_moisture = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Soil Moisture (%)',
            data: [],
            borderColor: '#38bdf8', // sky-400
            backgroundColor: gradient,
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 5,
            pointBackgroundColor: '#38bdf8'
          },
          {
            label: `Warning (${t.warning}%)`,
            data: [],
            borderColor: 'rgba(245, 158, 11, 0.75)',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: `Critical (${t.critical}%)`,
            data: [],
            borderColor: 'rgba(239, 68, 68, 0.85)',
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: this.getCommonOptions('Soil Moisture', '%', 0, 100, t.warning, t.critical)
    });
  }

  initTiltChart() {
    const ctx = document.getElementById('chart-tilt')?.getContext('2d');
    if (!ctx) return;

    const t = this.config.thresholds.tilt;
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(168, 85, 247, 0.35)');
    gradient.addColorStop(1, 'rgba(168, 85, 247, 0.0)');

    this.charts.tilt = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Tilt Angle (°)',
            data: [],
            borderColor: '#a855f7', // purple-500
            backgroundColor: gradient,
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 5,
            pointBackgroundColor: '#a855f7'
          },
          {
            label: `Warning (${t.warning}°)`,
            data: [],
            borderColor: 'rgba(245, 158, 11, 0.75)',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: `Critical (${t.critical}°)`,
            data: [],
            borderColor: 'rgba(239, 68, 68, 0.85)',
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: this.getCommonOptions('Tilt Angle', '°', 0, 20, t.warning, t.critical)
    });
  }

  initVibrationChart() {
    const ctx = document.getElementById('chart-vibration')?.getContext('2d');
    if (!ctx) return;

    const t = this.config.thresholds.vibration;
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.35)');
    gradient.addColorStop(1, 'rgba(34, 197, 94, 0.0)');

    this.charts.vibration = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Vibration (dps)',
            data: [],
            borderColor: '#22c55e', // green-500
            backgroundColor: gradient,
            fill: true,
            tension: 0.2,
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 5,
            pointBackgroundColor: '#22c55e'
          },
          {
            label: `Warning (${t.warning} dps)`,
            data: [],
            borderColor: 'rgba(245, 158, 11, 0.75)',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: `Critical (${t.critical} dps)`,
            data: [],
            borderColor: 'rgba(239, 68, 68, 0.85)',
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: this.getCommonOptions('Vibration', ' dps', 0, 100, t.warning, t.critical)
    });
  }

  initRainChart() {
    const ctx = document.getElementById('chart-rain')?.getContext('2d');
    if (!ctx) return;

    const t = this.config.thresholds.rain;
    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
    gradient.addColorStop(1, 'rgba(14, 165, 233, 0.0)');

    this.charts.rain = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Rainfall (%)',
            data: [],
            borderColor: '#0ea5e9', // cyan-500
            backgroundColor: gradient,
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 1,
            pointHoverRadius: 5,
            pointBackgroundColor: '#0ea5e9'
          },
          {
            label: `Warning (${t.warning}%)`,
            data: [],
            borderColor: 'rgba(245, 158, 11, 0.75)',
            borderDash: [5, 5],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          },
          {
            label: `Critical (${t.critical}%)`,
            data: [],
            borderColor: 'rgba(239, 68, 68, 0.85)',
            borderDash: [4, 4],
            borderWidth: 1.5,
            pointRadius: 0,
            fill: false
          }
        ]
      },
      options: this.getCommonOptions('Rain Intensity', '%', 0, 100, t.warning, t.critical)
    });
  }

  addReading(reading) {
    const timeLabel = this.formatTime(reading.timestamp);
    this.historyBuffer.push({ ...reading, timeLabel });

    if (this.historyBuffer.length > this.maxPoints) {
      this.historyBuffer.shift();
    }

    const labels = this.historyBuffer.map(r => r.timeLabel);
    const thresholds = this.config.thresholds;

    // 1. Soil Moisture
    if (this.charts.soil_moisture) {
      const c = this.charts.soil_moisture;
      c.data.labels = labels;
      c.data.datasets[0].data = this.historyBuffer.map(r => Number(r.soil_moisture));
      c.data.datasets[1].data = labels.map(() => thresholds.soil_moisture.warning);
      c.data.datasets[2].data = labels.map(() => thresholds.soil_moisture.critical);
      c.update('none');
    }

    // 2. Tilt
    if (this.charts.tilt) {
      const c = this.charts.tilt;
      c.data.labels = labels;
      c.data.datasets[0].data = this.historyBuffer.map(r => Number(r.tilt));
      c.data.datasets[1].data = labels.map(() => thresholds.tilt.warning);
      c.data.datasets[2].data = labels.map(() => thresholds.tilt.critical);
      c.update('none');
    }

    // 3. Vibration
    if (this.charts.vibration) {
      const c = this.charts.vibration;
      c.data.labels = labels;
      c.data.datasets[0].data = this.historyBuffer.map(r => Number(r.vibration));
      c.data.datasets[1].data = labels.map(() => thresholds.vibration.warning);
      c.data.datasets[2].data = labels.map(() => thresholds.vibration.critical);
      c.update('none');
    }

    // 4. Rain
    if (this.charts.rain) {
      const c = this.charts.rain;
      c.data.labels = labels;
      c.data.datasets[0].data = this.historyBuffer.map(r => {
        const val = Number(r.rain);
        return isNaN(val) ? 0 : val;
      });
      c.data.datasets[1].data = labels.map(() => thresholds.rain.warning);
      c.data.datasets[2].data = labels.map(() => thresholds.rain.critical);
      c.update('none');
    }
  }

  updateThresholdLines() {
    const thresholds = this.config.thresholds;
    const len = this.historyBuffer.length;
    const labels = this.historyBuffer.map(r => r.timeLabel);

    if (this.charts.soil_moisture) {
      this.charts.soil_moisture.data.datasets[1].label = `Warning (${thresholds.soil_moisture.warning}%)`;
      this.charts.soil_moisture.data.datasets[2].label = `Critical (${thresholds.soil_moisture.critical}%)`;
      this.charts.soil_moisture.data.datasets[1].data = labels.map(() => thresholds.soil_moisture.warning);
      this.charts.soil_moisture.data.datasets[2].data = labels.map(() => thresholds.soil_moisture.critical);
      this.charts.soil_moisture.update();
    }

    if (this.charts.tilt) {
      this.charts.tilt.data.datasets[1].label = `Warning (${thresholds.tilt.warning}°)`;
      this.charts.tilt.data.datasets[2].label = `Critical (${thresholds.tilt.critical}°)`;
      this.charts.tilt.data.datasets[1].data = labels.map(() => thresholds.tilt.warning);
      this.charts.tilt.data.datasets[2].data = labels.map(() => thresholds.tilt.critical);
      this.charts.tilt.update();
    }

    if (this.charts.vibration) {
      this.charts.vibration.data.datasets[1].label = `Warning (${thresholds.vibration.warning} dps)`;
      this.charts.vibration.data.datasets[2].label = `Critical (${thresholds.vibration.critical} dps)`;
      this.charts.vibration.data.datasets[1].data = labels.map(() => thresholds.vibration.warning);
      this.charts.vibration.data.datasets[2].data = labels.map(() => thresholds.vibration.critical);
      this.charts.vibration.update();
    }

    if (this.charts.rain) {
      this.charts.rain.data.datasets[1].label = `Warning (${thresholds.rain.warning}%)`;
      this.charts.rain.data.datasets[2].label = `Critical (${thresholds.rain.critical}%)`;
      this.charts.rain.data.datasets[1].data = labels.map(() => thresholds.rain.warning);
      this.charts.rain.data.datasets[2].data = labels.map(() => thresholds.rain.critical);
      this.charts.rain.update();
    }
  }

  formatTime(isoString) {
    if (!isoString) return new Date().toLocaleTimeString();
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return new Date().toLocaleTimeString();
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  clear() {
    this.historyBuffer = [];
    Object.values(this.charts).forEach(c => {
      c.data.labels = [];
      c.data.datasets.forEach(ds => ds.data = []);
      c.update();
    });
  }
}

window.TerraWatchCharts = new ChartsManager();

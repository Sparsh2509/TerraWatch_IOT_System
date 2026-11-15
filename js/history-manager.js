/**
 * TerraWatch - Geotechnical Sensor Data History Manager
 * Maintains historical tabular telemetry log, supports filtering, searching, and CSV export.
 */

class HistoryManager {
  constructor() {
    this.records = [];
    this.maxRows = SYSTEM_CONFIG.MAX_HISTORY_ROWS || 200;
    this.filterRisk = 'ALL';
    this.filterSensor = 'ALL';
    this.searchQuery = '';
  }

  addRecord(reading, evaluation) {
    const timeFormatted = this.formatTime(reading.timestamp);
    const rainVal = typeof reading.rain === 'number' ? `${reading.rain.toFixed(1)}%` : reading.rain;

    const row = {
      id: 'rec_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6),
      rawTimestamp: reading.timestamp,
      timestamp: timeFormatted,
      soil_moisture: Number(reading.soil_moisture).toFixed(1) + '%',
      tilt: Number(reading.tilt).toFixed(2) + '°',
      vibration: Number(reading.vibration).toFixed(2) + ' dps',
      rain: rainVal + ` (${evaluation.rainCategory})`,
      risk: evaluation.risk.label,
      riskLevel: evaluation.level,
      trigger: evaluation.triggers.length > 0 ? evaluation.triggers.map(t => t.reason).join('; ') : 'Normal',
      rawMoisture: Number(reading.soil_moisture),
      rawTilt: Number(reading.tilt),
      rawVib: Number(reading.vibration),
      rawRain: Number(reading.rain) || 0
    };

    this.records.unshift(row);
    if (this.records.length > this.maxRows) {
      this.records.pop();
    }

    this.render();
  }

  formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  setFilters(risk, sensor, search) {
    if (risk !== undefined) this.filterRisk = risk;
    if (sensor !== undefined) this.filterSensor = sensor;
    if (search !== undefined) this.searchQuery = search.toLowerCase();
    this.render();
  }

  clear() {
    this.records = [];
    this.render();
  }

  exportCSV() {
    if (this.records.length === 0) {
      alert('No sensor history records available to export.');
      return;
    }

    const headers = ['Timestamp', 'Soil Moisture (%)', 'Tilt Angle (°)', 'Vibration (dps)', 'Rain (%)', 'Risk State', 'Trigger Information'];
    const rows = this.records.map(r => [
      `"${r.rawTimestamp || r.timestamp}"`,
      `"${r.soil_moisture}"`,
      `"${r.tilt}"`,
      `"${r.vibration}"`,
      `"${r.rain}"`,
      `"${r.risk}"`,
      `"${r.trigger.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `terrawatch_telemetry_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  render() {
    const tbody = document.getElementById('history-table-body');
    const countLabel = document.getElementById('history-count-badge');
    if (!tbody) return;

    let filtered = this.records.filter(r => {
      if (this.filterRisk !== 'ALL' && r.risk !== this.filterRisk) return false;
      if (this.filterSensor !== 'ALL') {
        if (this.filterSensor === 'MOISTURE' && !r.trigger.toLowerCase().includes('moisture')) return false;
        if (this.filterSensor === 'TILT' && !r.trigger.toLowerCase().includes('tilt')) return false;
        if (this.filterSensor === 'VIBRATION' && !r.trigger.toLowerCase().includes('vibration')) return false;
        if (this.filterSensor === 'RAIN' && !r.trigger.toLowerCase().includes('rain')) return false;
      }
      if (this.searchQuery) {
        const line = `${r.timestamp} ${r.soil_moisture} ${r.tilt} ${r.vibration} ${r.rain} ${r.risk} ${r.trigger}`.toLowerCase();
        if (!line.includes(this.searchQuery)) return false;
      }
      return true;
    });

    if (countLabel) {
      countLabel.textContent = `${filtered.length} / ${this.records.length} records`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-8 text-slate-500 font-mono text-xs">
            No history records matching the filter criteria.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(row => {
      let riskBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">SAFE</span>';
      if (row.risk === 'WARNING') {
        riskBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30">WARNING</span>';
      } else if (row.risk === 'CRITICAL') {
        riskBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-rose-500/15 text-rose-300 border border-rose-500/40 animate-pulse">CRITICAL</span>';
      }

      return `
        <tr class="hover:bg-slate-800/40 border-b border-slate-800/60 font-mono text-xs text-slate-300 transition-colors">
          <td class="py-2.5 px-3 text-slate-400">${row.timestamp}</td>
          <td class="py-2.5 px-3 font-semibold text-sky-300">${row.soil_moisture}</td>
          <td class="py-2.5 px-3 font-semibold text-purple-300">${row.tilt}</td>
          <td class="py-2.5 px-3 font-semibold text-emerald-300">${row.vibration}</td>
          <td class="py-2.5 px-3 text-cyan-300">${row.rain}</td>
          <td class="py-2.5 px-3">${riskBadge}</td>
          <td class="py-2.5 px-3 text-slate-400 font-sans text-xs truncate max-w-xs" title="${row.trigger}">${row.trigger}</td>
        </tr>
      `;
    }).join('');
  }
}

window.TerraWatchHistory = new HistoryManager();

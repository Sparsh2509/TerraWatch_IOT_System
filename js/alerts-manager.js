/**
 * TerraWatch - Alerts & Events Manager
 * Records real-time threshold breaches, status changes, and geotechnical events.
 * Manages chronological event queue and triggers audio/visual alarms.
 */

class AlertsManager {
  constructor() {
    this.alerts = [];
    this.maxAlerts = SYSTEM_CONFIG.MAX_ALERT_ROWS || 100;
    this.filterSeverity = 'ALL';
    this.lastRiskLevel = 0; // 0: SAFE, 1: WARNING, 2: CRITICAL
    this.lastAlertTime = 0;
  }

  init() {
    this.render();
  }

  processRiskEvaluation(evaluation, reading) {
    const currentLevel = evaluation.level;
    const now = Date.now();
    const timeFormatted = this.formatTime(evaluation.timestamp);

    // Detect level transition or periodic alert in elevated state
    const isLevelChange = currentLevel !== this.lastRiskLevel;
    const isPeriodicCritical = currentLevel === 2 && (now - this.lastAlertTime > 8000);
    const isPeriodicWarning = currentLevel === 1 && (now - this.lastAlertTime > 15000);

    if (isLevelChange || isPeriodicCritical || isPeriodicWarning) {
      this.lastAlertTime = now;

      if (currentLevel === 2) {
        // Critical
        this.addAlert({
          timestamp: timeFormatted,
          isoTime: evaluation.timestamp,
          severity: 'CRITICAL',
          sensor: this.getTriggeringSensorsList(evaluation),
          message: evaluation.primaryTrigger || 'Critical landslide risk threshold breached!'
        });
        window.TerraWatchAudio.playCriticalAlarm();
      } else if (currentLevel === 1) {
        // Warning
        this.addAlert({
          timestamp: timeFormatted,
          isoTime: evaluation.timestamp,
          severity: 'WARNING',
          sensor: this.getTriggeringSensorsList(evaluation),
          message: evaluation.primaryTrigger || 'Slope instability parameter approaching threshold.'
        });
        window.TerraWatchAudio.playWarningBeep();
      } else if (currentLevel === 0 && this.lastRiskLevel > 0) {
        // Recovered back to SAFE
        this.addAlert({
          timestamp: timeFormatted,
          isoTime: evaluation.timestamp,
          severity: 'SAFE',
          sensor: 'All Sensors',
          message: 'System returned to normal operating baseline. Slope stable.'
        });
      }

      this.lastRiskLevel = currentLevel;
    }
  }

  getTriggeringSensorsList(evaluation) {
    if (!evaluation.triggers || evaluation.triggers.length === 0) return 'System';
    const sensors = [];
    if (evaluation.sensorStatus.soil_moisture.level > 0) sensors.push('Moisture');
    if (evaluation.sensorStatus.tilt.level > 0) sensors.push('Tilt');
    if (evaluation.sensorStatus.vibration.level > 0) sensors.push('Vibration');
    if (evaluation.sensorStatus.rain.level > 0) sensors.push('Rain');
    return sensors.length > 0 ? sensors.join(', ') : 'Sensor Array';
  }

  addAlert(alertItem) {
    const item = {
      id: 'alert_' + Date.now() + '_' + Math.random().toString(16).substring(2, 6),
      ...alertItem
    };

    this.alerts.unshift(item);
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.pop();
    }

    this.render();
  }

  setFilter(severity) {
    this.filterSeverity = severity;
    this.render();
  }

  clear() {
    this.alerts = [];
    this.render();
  }

  formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  render() {
    const container = document.getElementById('alerts-list');
    const badgeCount = document.getElementById('alert-count-badge');
    if (!container) return;

    const filtered = this.alerts.filter(a => {
      if (this.filterSeverity === 'ALL') return true;
      return a.severity === this.filterSeverity;
    });

    if (badgeCount) {
      const activeElevated = this.alerts.filter(a => a.severity === 'WARNING' || a.severity === 'CRITICAL').length;
      badgeCount.textContent = activeElevated > 0 ? activeElevated : this.alerts.length;
      badgeCount.className = activeElevated > 0
        ? 'px-2 py-0.5 text-xs rounded-full font-mono font-semibold bg-rose-900/50 text-rose-300 border border-rose-700/50'
        : 'px-2 py-0.5 text-xs rounded-full font-mono text-slate-400 bg-slate-800 border border-slate-700';
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-8 text-slate-500 text-center">
          <div class="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center mb-2 text-slate-400">
            <i data-lucide="bell-off" class="w-5 h-5"></i>
          </div>
          <span class="text-xs uppercase tracking-wider font-semibold">No Events Logged</span>
          <span class="text-[11px] text-slate-500 mt-0.5">Alerts will appear here when sensor limits are reached</span>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    container.innerHTML = filtered.map(item => {
      let icon = 'shield-check';
      let sevBg = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      let dotColor = 'bg-emerald-400';
      let glowBorder = '';

      if (item.severity === 'WARNING') {
        icon = 'alert-triangle';
        sevBg = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
        dotColor = 'bg-amber-400';
        glowBorder = 'border-l-2 border-l-amber-500';
      } else if (item.severity === 'CRITICAL') {
        icon = 'alert-octagon';
        sevBg = 'bg-rose-500/15 text-rose-300 border-rose-500/40';
        dotColor = 'bg-rose-500';
        glowBorder = 'border-l-2 border-l-rose-500 animate-pulse';
      }

      return `
        <div class="p-3 bg-slate-900/70 hover:bg-slate-800/70 border border-slate-800/80 rounded-lg transition-all flex items-start gap-3 ${glowBorder}">
          <div class="mt-0.5 flex-shrink-0">
            <span class="flex h-2.5 w-2.5 relative">
              ${item.severity === 'CRITICAL' ? `<span class="animate-ping absolute inline-flex h-full w-full rounded-full ${dotColor} opacity-75"></span>` : ''}
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 ${dotColor}"></span>
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-mono text-[11px] text-slate-400">${item.timestamp}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-semibold border ${sevBg}">
                ${item.severity}
              </span>
            </div>
            <div class="text-xs font-medium text-slate-200 break-words leading-relaxed">${item.message}</div>
            <div class="mt-1 text-[10px] text-slate-400 flex items-center gap-1.5 font-mono">
              <span class="text-slate-500">Sensor:</span>
              <span class="text-slate-300">${item.sensor}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
  }
}

window.TerraWatchAlerts = new AlertsManager();

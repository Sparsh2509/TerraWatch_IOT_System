/**
 * TerraWatch - Main Application Controller
 * Coordinates telemetry pipeline, UI state, tabs, modals, node heartbeat monitoring, and controls.
 */

class TerraWatchApp {
  constructor() {
    this.currentMode = 'demo'; // 'real' or 'demo'
    this.lastReadingTime = null;
    this.lastReading = null;
    this.nodeHeartbeatInterval = null;
    this.clockInterval = null;
    this.isMuted = false;
  }

  init() {
    console.log('[TerraWatch] Initializing Geotechnical IoT Monitoring Dashboard...');

    // Initialize Charts
    window.TerraWatchCharts.init();

    // Initialize Alerts
    window.TerraWatchAlerts.init();

    // Setup Event Listeners
    this.setupEventListeners();

    // Start Real-Time Clock
    this.startClock();

    // Start Node Liveness Watchdog (stale data detector)
    this.startWatchdog();

    // Initialize MQTT client callbacks
    window.TerraWatchMQTT.init(
      (topic, normalizedData, raw) => this.handleTelemetry(normalizedData, false),
      (statusObj) => this.handleMQTTStatusChange(statusObj)
    );

    // Initialize Simulator callback
    window.TerraWatchSimulator.onDataCallback = (topic, data, meta) => {
      if (this.currentMode === 'demo') {
        this.handleTelemetry(data, true);
      }
    };

    // Load saved preferences
    const prefs = window.TerraWatchConfig.uiPrefs;
    if (prefs.activeTab) {
      this.switchTab(prefs.activeTab);
    }

    // Default to Demo mode or Real mode based on config/query param
    const urlParams = new URLSearchParams(window.location.search);
    const modeParam = urlParams.get('mode');

    if (modeParam === 'real' || prefs.activeMode === 'real') {
      this.setMode('real');
    } else {
      this.setMode('demo');
    }

    // Trigger Lucide icons render
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  startClock() {
    const clockEl = document.getElementById('live-clock');
    const update = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }

  startWatchdog() {
    this.nodeHeartbeatInterval = setInterval(() => {
      const now = Date.now();
      const nodeStatusEl = document.getElementById('status-esp32-node');
      const dataStatusEl = document.getElementById('status-sensor-data');
      const headerLiveDot = document.getElementById('header-live-dot');
      const headerLiveText = document.getElementById('header-live-text');

      if (!this.lastReadingTime) {
        if (nodeStatusEl) nodeStatusEl.innerHTML = '<span class="text-slate-500 font-mono text-xs">Waiting for data...</span>';
        if (dataStatusEl) dataStatusEl.innerHTML = '<span class="text-slate-500 font-mono text-xs">No Data</span>';
        return;
      }

      const elapsed = now - this.lastReadingTime;

      if (elapsed > SYSTEM_CONFIG.NODE_TIMEOUT_MS) {
        // Node is OFFLINE
        if (nodeStatusEl) {
          nodeStatusEl.innerHTML = `
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <span class="w-2 h-2 rounded-full bg-rose-500"></span> Offline
            </span>
          `;
        }
        if (dataStatusEl) {
          dataStatusEl.innerHTML = `
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
              <i data-lucide="alert-circle" class="w-3.5 h-3.5"></i> No Signal (${Math.floor(elapsed / 1000)}s)
            </span>
          `;
        }
        if (headerLiveDot) headerLiveDot.className = 'w-2 h-2 rounded-full bg-slate-500';
        if (headerLiveText) headerLiveText.textContent = 'STANDBY';

        this.setSensorsHealthStatus('Offline / Stale');
      } else if (elapsed > SYSTEM_CONFIG.STALE_DATA_TIMEOUT_MS) {
        // Node is degraded / Stale
        if (dataStatusEl) {
          dataStatusEl.innerHTML = `
            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Stale Data (${Math.floor(elapsed / 1000)}s)
            </span>
          `;
        }
      }
    }, 1000);
  }

  setMode(mode) {
    this.currentMode = mode;
    window.TerraWatchConfig.saveUIPrefs({ activeMode: mode });

    const badgeMode = document.getElementById('mode-indicator-badge');
    const demoControls = document.getElementById('demo-control-bar');
    const realModeInfo = document.getElementById('real-mode-info');
    const toggleBtn = document.getElementById('btn-toggle-mode');

    if (mode === 'real') {
      // Switch to Real MQTT Mode
      window.TerraWatchSimulator.stop();
      window.TerraWatchMQTT.connect();

      if (badgeMode) {
        badgeMode.innerHTML = `
          <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/30">
            <span class="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span> REAL MQTT MODE
          </span>
        `;
      }
      if (demoControls) demoControls.classList.add('hidden');
      if (realModeInfo) realModeInfo.classList.remove('hidden');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<i data-lucide="radio" class="w-3.5 h-3.5"></i> Switch to Demo Mode';
      }
    } else {
      // Switch to Demo Mode
      window.TerraWatchMQTT.disconnect();
      window.TerraWatchSimulator.start(SYSTEM_CONFIG.DEMO_INTERVAL_MS);

      if (badgeMode) {
        badgeMode.innerHTML = `
          <span class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> DEMO MODE (SIMULATED)
          </span>
        `;
      }
      if (demoControls) demoControls.classList.remove('hidden');
      if (realModeInfo) realModeInfo.classList.add('hidden');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<i data-lucide="zap" class="w-3.5 h-3.5"></i> Switch to Real MQTT';
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  handleTelemetry(reading, isSimulated) {
    this.lastReadingTime = Date.now();
    this.lastReading = reading;

    // Update Header Live Dot
    const headerLiveDot = document.getElementById('header-live-dot');
    const headerLiveText = document.getElementById('header-live-text');
    const lastUpdateHeader = document.getElementById('header-last-update');

    if (headerLiveDot) headerLiveDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-ping';
    if (headerLiveText) headerLiveText.textContent = 'LIVE';
    if (lastUpdateHeader) {
      const d = reading.timestamp ? new Date(reading.timestamp) : new Date();
      lastUpdateHeader.textContent = d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    // Geotechnical Risk Evaluation
    const evaluation = window.TerraWatchRiskEngine.evaluate(reading);

    // 1. Update Dominant Central Risk Card
    this.updateRiskStatusCard(evaluation);

    // 2. Update 4 Sensor Cards
    this.updateSensorCards(reading, evaluation);

    // 3. Update Real-Time Charts
    window.TerraWatchCharts.addReading(reading);

    // 4. Update Alert Log
    window.TerraWatchAlerts.processRiskEvaluation(evaluation, reading);

    // 5. Update Tabular History Log
    window.TerraWatchHistory.addRecord(reading, evaluation);

    // 6. Update System & Sensor Health Panels
    this.updateSystemStatusPanel(reading, evaluation, isSimulated);

    // 7. Update Local Hardware Alert Indicator
    this.updateLocalAlertPanel(evaluation);
  }

  updateRiskStatusCard(evalResult) {
    const card = document.getElementById('risk-status-container');
    const badge = document.getElementById('risk-badge');
    const title = document.getElementById('risk-headline');
    const summary = document.getElementById('risk-summary');
    const triggerEl = document.getElementById('risk-trigger-reason');
    const slopeVisual = document.getElementById('slope-stability-gauge');

    if (!card) return;

    // Apply color and glow states
    card.className = `p-6 rounded-2xl border transition-all duration-500 relative overflow-hidden backdrop-blur-md ${evalResult.risk.key === 'CRITICAL'
      ? 'bg-rose-950/25 border-rose-500/50 shadow-[0_0_40px_rgba(239,68,68,0.2)]'
      : evalResult.risk.key === 'WARNING'
        ? 'bg-amber-950/25 border-amber-500/50 shadow-[0_0_35px_rgba(245,158,11,0.15)]'
        : 'bg-emerald-950/20 border-emerald-500/35 shadow-[0_0_30px_rgba(16,185,129,0.1)]'
      }`;

    // Update Status Pill
    if (badge) {
      badge.className = `inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-sm font-bold tracking-widest uppercase border ${evalResult.risk.key === 'CRITICAL'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500 animate-pulse'
        : evalResult.risk.key === 'WARNING'
          ? 'bg-amber-500/20 text-amber-300 border-amber-500'
          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
        }`;
      badge.innerHTML = `
        <span class="w-3 h-3 rounded-full ${evalResult.risk.key === 'CRITICAL' ? 'bg-rose-500 animate-ping' : evalResult.risk.key === 'WARNING' ? 'bg-amber-500' : 'bg-emerald-500'
        }"></span>
        ${evalResult.risk.label}
      `;
    }

    if (title) title.textContent = evalResult.risk.headline;
    if (summary) summary.textContent = evalResult.risk.summary;

    if (triggerEl) {
      if (evalResult.triggers.length > 0) {
        const isCrit = evalResult.risk.key === 'CRITICAL';
        const icon = isCrit ? '🚨' : '⚠';
        const label = isCrit ? 'CRITICAL TRIGGER' : 'WARNING TRIGGER';
        const textColor = isCrit ? 'text-rose-300' : 'text-amber-300';
        const bgBox = isCrit ? 'bg-rose-950/60 border-rose-700/60' : 'bg-amber-950/60 border-amber-700/60';

        triggerEl.innerHTML = `
          <div class="p-3 rounded-lg border ${bgBox} flex items-start gap-2.5">
            <span class="text-base leading-none">${icon}</span>
            <div class="text-xs">
              <span class="font-bold tracking-wide ${textColor} block mb-0.5">${label}</span>
              <span class="text-slate-200 font-medium">${evalResult.primaryTrigger}</span>
            </div>
          </div>
        `;
      } else {
        triggerEl.innerHTML = `
          <div class="p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 flex items-center gap-2">
            <span class="text-emerald-400 text-sm">✓</span>
            <span class="text-xs text-slate-300">All 4 geotechnical sensors operating below warning thresholds.</span>
          </div>
        `;
      }
    }

    if (slopeVisual) {
      // Graphical slope representation
      const tiltVal = Math.min(25, Math.max(0, evalResult.sensorStatus.tilt?.level > 0 ? this.lastReading.tilt : 2.5));
      slopeVisual.style.transform = `rotate(-${tiltVal * 1.5}deg)`;
    }
  }

  updateSensorCards(reading, evaluation) {
    const thresholds = window.TerraWatchConfig.thresholds;

    // Helper for trend badge
    const renderTrend = (diff, unit) => {
      if (Math.abs(diff) < 0.05) {
        return '<span class="text-slate-500 font-mono text-xs flex items-center gap-0.5"><i data-lucide="minus" class="w-3 h-3"></i> Steady</span>';
      }
      if (diff > 0) {
        return `<span class="text-rose-400 font-mono text-xs flex items-center gap-0.5"><i data-lucide="trending-up" class="w-3 h-3"></i> +${diff.toFixed(2)}${unit}</span>`;
      }
      return `<span class="text-emerald-400 font-mono text-xs flex items-center gap-0.5"><i data-lucide="trending-down" class="w-3 h-3"></i> ${diff.toFixed(2)}${unit}</span>`;
    };

    // Helper for status tag
    const renderStatusBadge = (status) => {
      if (status === 'CRITICAL') {
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/40">CRITICAL</span>';
      }
      if (status === 'WARNING') {
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40">WARNING</span>';
      }
      return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">SAFE</span>';
    };

    // 1. SOIL MOISTURE CARD
    const valMoisture = document.getElementById('card-moisture-val');
    const trendMoisture = document.getElementById('card-moisture-trend');
    const statusMoisture = document.getElementById('card-moisture-status');
    const barMoisture = document.getElementById('card-moisture-bar');
    const timeMoisture = document.getElementById('card-moisture-time');

    if (valMoisture) valMoisture.textContent = `${reading.soil_moisture}%`;
    if (trendMoisture) trendMoisture.innerHTML = renderTrend(evaluation.trends.soil_moisture, '%');
    if (statusMoisture) statusMoisture.innerHTML = renderStatusBadge(evaluation.sensorStatus.soil_moisture.status);
    if (barMoisture) {
      const pct = Math.min(100, Math.max(0, reading.soil_moisture));
      barMoisture.style.width = `${pct}%`;
      barMoisture.className = `h-full rounded-full transition-all duration-300 ${pct >= thresholds.soil_moisture.critical ? 'bg-rose-500' : pct >= thresholds.soil_moisture.warning ? 'bg-amber-500' : 'bg-sky-400'
        }`;
    }
    if (timeMoisture) timeMoisture.textContent = new Date(reading.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // 2. TILT ANGLE CARD
    const valTilt = document.getElementById('card-tilt-val');
    const trendTilt = document.getElementById('card-tilt-trend');
    const statusTilt = document.getElementById('card-tilt-status');
    const barTilt = document.getElementById('card-tilt-bar');

    if (valTilt) valTilt.textContent = `${reading.tilt}°`;
    if (trendTilt) trendTilt.innerHTML = renderTrend(evaluation.trends.tilt, '°');
    if (statusTilt) statusTilt.innerHTML = renderStatusBadge(evaluation.sensorStatus.tilt.status);
    if (barTilt) {
      const pct = Math.min(100, (reading.tilt / thresholds.tilt.critical) * 100);
      barTilt.style.width = `${pct}%`;
      barTilt.className = `h-full rounded-full transition-all duration-300 ${reading.tilt >= thresholds.tilt.critical ? 'bg-rose-500' : reading.tilt >= thresholds.tilt.warning ? 'bg-amber-500' : 'bg-purple-400'
        }`;
    }

    // 3. VIBRATION CARD
    const valVib = document.getElementById('card-vibration-val');
    const trendVib = document.getElementById('card-vibration-trend');
    const statusVib = document.getElementById('card-vibration-status');
    const barVib = document.getElementById('card-vibration-bar');

    if (valVib) valVib.textContent = `${reading.vibration} dps`;
    if (trendVib) trendVib.innerHTML = renderTrend(evaluation.trends.vibration, ' dps');
    if (statusVib) statusVib.innerHTML = renderStatusBadge(evaluation.sensorStatus.vibration.status);
    if (barVib) {
      const pct = Math.min(100, (reading.vibration / (thresholds.vibration.critical * 1.5)) * 100);
      barVib.style.width = `${pct}%`;
      barVib.className = `h-full rounded-full transition-all duration-300 ${reading.vibration >= thresholds.vibration.critical ? 'bg-rose-500' : reading.vibration >= thresholds.vibration.warning ? 'bg-amber-500' : 'bg-emerald-400'
        }`;
    }

    // 4. RAIN CARD
    const valRain = document.getElementById('card-rain-val');
    const badgeRain = document.getElementById('card-rain-category');
    const trendRain = document.getElementById('card-rain-trend');
    const barRain = document.getElementById('card-rain-bar');

    if (valRain) {
      valRain.textContent = typeof reading.rain === 'number' ? `${reading.rain}%` : reading.rain;
    }
    if (badgeRain) {
      const cat = evaluation.rainCategory;
      let badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      if (cat === 'MEDIUM') badgeStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      if (cat === 'HIGH') badgeStyle = 'bg-rose-500/15 text-rose-300 border-rose-500/40';
      badgeRain.innerHTML = `<span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeStyle}">${cat}</span>`;
    }
    if (trendRain) trendRain.innerHTML = renderTrend(evaluation.trends.rain, '%');
    if (barRain) {
      const rNum = Number(reading.rain) || 0;
      const pct = Math.min(100, (rNum / thresholds.rain.critical) * 100);
      barRain.style.width = `${pct}%`;
      barRain.className = `h-full rounded-full transition-all duration-300 ${rNum >= thresholds.rain.critical ? 'bg-rose-500' : rNum >= thresholds.rain.warning ? 'bg-amber-500' : 'bg-cyan-400'
        }`;
    }

    if (window.lucide) window.lucide.createIcons();
  }

  updateSystemStatusPanel(reading, evaluation, isSimulated) {
    const nodeStatusEl = document.getElementById('status-esp32-node');
    const dataStatusEl = document.getElementById('status-sensor-data');
    const lastReadingEl = document.getElementById('status-last-reading');
    const latencyEl = document.getElementById('status-data-latency');

    if (nodeStatusEl) {
      nodeStatusEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Online (${reading.node_id || 'ESP32_DEV'})
        </span>
      `;
    }

    if (dataStatusEl) {
      dataStatusEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <i data-lucide="radio" class="w-3.5 h-3.5 text-emerald-400"></i> Receiving
        </span>
      `;
    }

    if (lastReadingEl) {
      lastReadingEl.textContent = new Date(reading.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    if (latencyEl) {
      const lat = isSimulated ? 12 : (window.TerraWatchMQTT.latencyMs || 240);
      latencyEl.textContent = `${lat} ms`;
    }

    // Individual Sensor Health Status
    this.updateSensorHealthPills(evaluation.health);
  }

  updateSensorHealthPills(health) {
    const setPill = (id, check) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (check.ok) {
        el.innerHTML = '<span class="inline-flex items-center gap-1 text-emerald-400 text-xs font-mono"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Normal</span>';
      } else {
        el.innerHTML = `<span class="inline-flex items-center gap-1 text-rose-400 text-xs font-mono"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping"></span> ${check.label}</span>`;
      }
    };

    setPill('health-tilt', health.tilt);
    setPill('health-vibration', health.vibration);
    setPill('health-moisture', health.soil_moisture);
    setPill('health-rain', health.rain);
  }

  setSensorsHealthStatus(statusText) {
    ['health-tilt', 'health-vibration', 'health-moisture', 'health-rain'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<span class="text-amber-400 text-xs font-mono">⚠ ${statusText}</span>`;
    });
  }

  updateLocalAlertPanel(evaluation) {
    const buzzerEl = document.getElementById('local-buzzer-status');
    const ledEl = document.getElementById('local-led-status');
    const relayEl = document.getElementById('local-relay-status');

    if (!buzzerEl || !ledEl) return;

    if (evaluation.risk.key === 'CRITICAL') {
      buzzerEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold font-mono bg-rose-500/20 text-rose-300 border border-rose-500 animate-pulse">
          🚨 ACTIVE (ALARM SOUNDING)
        </span>
      `;
      ledEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold font-mono bg-rose-500/20 text-rose-300 border border-rose-500">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span> RED (RAPID BLINK)
        </span>
      `;
      if (relayEl) {
        relayEl.innerHTML = '<span class="text-xs font-mono text-rose-400 font-bold">TRIGGERED (EVACUATION SIREN)</span>';
      }
    } else if (evaluation.risk.key === 'WARNING') {
      buzzerEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40">
          ⚠ INTERMITTENT CHIME
        </span>
      `;
      ledEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold font-mono bg-amber-500/15 text-amber-300 border border-amber-500/40">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span> AMBER (SLOW BLINK)
        </span>
      `;
      if (relayEl) {
        relayEl.innerHTML = '<span class="text-xs font-mono text-amber-400">ARMED</span>';
      }
    } else {
      buzzerEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono text-slate-300 bg-slate-800/80 border border-slate-700">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span> READY / STANDBY
        </span>
      `;
      ledEl.innerHTML = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span> GREEN (SOLID NORMAL)
        </span>
      `;
      if (relayEl) {
        relayEl.innerHTML = '<span class="text-xs font-mono text-slate-400">STANDBY</span>';
      }
    }
  }

  handleMQTTStatusChange(statusObj) {
    const statusBadge = document.getElementById('mqtt-status-badge');
    const brokerEl = document.getElementById('mqtt-broker-val');
    const topicEl = document.getElementById('mqtt-topic-val');
    const msgCountEl = document.getElementById('mqtt-msg-count');
    const uptimeEl = document.getElementById('mqtt-uptime');
    const lastMsgEl = document.getElementById('mqtt-last-msg-time');
    const latencyEl = document.getElementById('mqtt-latency');
    const brokerSystemStatus = document.getElementById('status-mqtt-broker');
    const disconnectBanner = document.getElementById('mqtt-disconnect-banner');

    if (brokerEl) brokerEl.textContent = statusObj.brokerUrl;
    if (topicEl) topicEl.textContent = statusObj.topic;
    if (msgCountEl) msgCountEl.textContent = statusObj.messageCount;
    if (uptimeEl) uptimeEl.textContent = statusObj.uptimeFormatted;
    if (latencyEl) latencyEl.textContent = `${statusObj.latencyMs} ms`;
    if (lastMsgEl && statusObj.lastMessageTime) {
      lastMsgEl.textContent = statusObj.lastMessageTime.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    if (statusObj.status === 'CONNECTED') {
      if (statusBadge) {
        statusBadge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Connected
          </span>
        `;
      }
      if (brokerSystemStatus) {
        brokerSystemStatus.innerHTML = '<span class="text-emerald-400 font-mono text-xs">● Connected</span>';
      }
      if (disconnectBanner) disconnectBanner.classList.add('hidden');
    } else if (statusObj.status === 'CONNECTING') {
      if (statusBadge) {
        statusBadge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 font-mono">
            <span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> Connecting...
          </span>
        `;
      }
      if (brokerSystemStatus) {
        brokerSystemStatus.innerHTML = '<span class="text-amber-400 font-mono text-xs">Connecting...</span>';
      }
    } else {
      // Disconnected or Error
      if (statusBadge) {
        statusBadge.innerHTML = `
          <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 font-mono">
            <span class="w-2 h-2 rounded-full bg-rose-500"></span> Disconnected
          </span>
        `;
      }
      if (brokerSystemStatus) {
        brokerSystemStatus.innerHTML = '<span class="text-rose-400 font-mono text-xs">● Disconnected</span>';
      }
      if (disconnectBanner && this.currentMode === 'real') {
        disconnectBanner.classList.remove('hidden');
      }
    }
  }

  setupEventListeners() {
    // Mode Switcher Toggle
    const btnToggleMode = document.getElementById('btn-toggle-mode');
    if (btnToggleMode) {
      btnToggleMode.addEventListener('click', () => {
        this.setMode(this.currentMode === 'real' ? 'demo' : 'real');
      });
    }

    // Demo Scenario Switchers
    document.querySelectorAll('.demo-scenario-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const scenario = e.currentTarget.getAttribute('data-scenario');
        window.TerraWatchSimulator.setScenario(scenario);

        // Highlight active scenario button
        document.querySelectorAll('.demo-scenario-btn').forEach(b => {
          b.classList.remove('ring-2', 'ring-sky-400', 'bg-slate-700');
          b.classList.add('bg-slate-800');
        });
        e.currentTarget.classList.add('ring-2', 'ring-sky-400', 'bg-slate-700');
      });
    });

    // Navigation Tabs
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Audio Alert Mute/Unmute
    const btnAudioMute = document.getElementById('btn-audio-mute');
    if (btnAudioMute) {
      btnAudioMute.addEventListener('click', () => {
        this.isMuted = window.TerraWatchAudio.toggleMute();
        btnAudioMute.innerHTML = this.isMuted
          ? '<i data-lucide="volume-x" class="w-4 h-4 text-rose-400"></i>'
          : '<i data-lucide="volume-2" class="w-4 h-4 text-emerald-400"></i>';
        if (window.lucide) window.lucide.createIcons();
      });
    }

    // Test Alert / Hardware Buzzer Button
    const btnTestAlert = document.getElementById('btn-test-alert');
    if (btnTestAlert) {
      btnTestAlert.addEventListener('click', () => {
        window.TerraWatchAudio.ensureContext();
        window.TerraWatchAudio.playCriticalAlarm();
        // Also send test command over MQTT if connected
        window.TerraWatchMQTT.publishCommand('BUZZER_TEST', { durationMs: 2000 });
      });
    }

    // Thresholds Modal Controls
    const btnOpenThresholds = document.getElementById('btn-open-thresholds');
    const modalThresholds = document.getElementById('modal-thresholds');
    const btnCloseThresholds = document.getElementById('btn-close-thresholds');
    const formThresholds = document.getElementById('form-thresholds');
    const btnResetThresholds = document.getElementById('btn-reset-thresholds');

    if (btnOpenThresholds && modalThresholds) {
      btnOpenThresholds.addEventListener('click', () => {
        this.populateThresholdsForm();
        modalThresholds.classList.remove('hidden');
      });
    }

    if (btnCloseThresholds && modalThresholds) {
      btnCloseThresholds.addEventListener('click', () => {
        modalThresholds.classList.add('hidden');
      });
    }

    if (btnResetThresholds) {
      btnResetThresholds.addEventListener('click', () => {
        window.TerraWatchConfig.resetThresholds();
        this.populateThresholdsForm();
        alert('Threshold limits reset to default factory values.');
      });
    }

    if (formThresholds) {
      formThresholds.addEventListener('submit', (e) => {
        e.preventDefault();
        const updated = {
          soil_moisture: {
            ...window.TerraWatchConfig.thresholds.soil_moisture,
            warning: parseFloat(document.getElementById('input-moisture-warn').value),
            critical: parseFloat(document.getElementById('input-moisture-crit').value)
          },
          tilt: {
            ...window.TerraWatchConfig.thresholds.tilt,
            warning: parseFloat(document.getElementById('input-tilt-warn').value),
            critical: parseFloat(document.getElementById('input-tilt-crit').value)
          },
          vibration: {
            ...window.TerraWatchConfig.thresholds.vibration,
            warning: parseFloat(document.getElementById('input-vib-warn').value),
            critical: parseFloat(document.getElementById('input-vib-crit').value)
          },
          rain: {
            ...window.TerraWatchConfig.thresholds.rain,
            warning: parseFloat(document.getElementById('input-rain-warn').value),
            critical: parseFloat(document.getElementById('input-rain-crit').value)
          }
        };

        window.TerraWatchConfig.saveThresholds(updated);
        modalThresholds.classList.add('hidden');
        alert('Threshold limits successfully updated and applied.');
      });
    }

    // MQTT Configuration Modal
    const btnOpenMQTT = document.getElementById('btn-open-mqtt-config');
    const modalMQTT = document.getElementById('modal-mqtt');
    const btnCloseMQTT = document.getElementById('btn-close-mqtt');
    const formMQTT = document.getElementById('form-mqtt');

    if (btnOpenMQTT && modalMQTT) {
      btnOpenMQTT.addEventListener('click', () => {
        this.populateMQTTForm();
        modalMQTT.classList.remove('hidden');
      });
    }

    if (btnCloseMQTT && modalMQTT) {
      btnCloseMQTT.addEventListener('click', () => {
        modalMQTT.classList.add('hidden');
      });
    }

    if (formMQTT) {
      formMQTT.addEventListener('submit', (e) => {
        e.preventDefault();
        const newCfg = {
          brokerUrl: document.getElementById('input-broker-url').value.trim(),
          topicTelemetry: document.getElementById('input-mqtt-topic').value.trim(),
          clientId: document.getElementById('input-client-id').value.trim(),
          username: document.getElementById('input-mqtt-user').value.trim(),
          password: document.getElementById('input-mqtt-pass').value.trim()
        };
        window.TerraWatchConfig.saveMQTTConfig(newCfg);
        modalMQTT.classList.add('hidden');

        if (this.currentMode === 'real') {
          window.TerraWatchMQTT.connect();
        }
      });
    }

    // MQTT Preset Buttons in Modal
    document.querySelectorAll('.broker-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.currentTarget.getAttribute('data-broker-url');
        const inputUrl = document.getElementById('input-broker-url');
        if (inputUrl && url) inputUrl.value = url;
      });
    });

    // Alert Filter Buttons
    document.querySelectorAll('.alert-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sev = e.currentTarget.getAttribute('data-sev');
        window.TerraWatchAlerts.setFilter(sev);

        document.querySelectorAll('.alert-filter-btn').forEach(b => {
          b.classList.remove('bg-sky-600', 'text-white');
          b.classList.add('bg-slate-800', 'text-slate-400');
        });
        e.currentTarget.classList.add('bg-sky-600', 'text-white');
      });
    });

    // History Table Filters & Export
    const filterHistoryRisk = document.getElementById('filter-history-risk');
    const filterHistorySensor = document.getElementById('filter-history-sensor');
    const searchHistory = document.getElementById('search-history');
    const btnExportCSV = document.getElementById('btn-export-csv');

    if (filterHistoryRisk) {
      filterHistoryRisk.addEventListener('change', (e) => {
        window.TerraWatchHistory.setFilters(e.target.value, undefined, undefined);
      });
    }
    if (filterHistorySensor) {
      filterHistorySensor.addEventListener('change', (e) => {
        window.TerraWatchHistory.setFilters(undefined, e.target.value, undefined);
      });
    }
    if (searchHistory) {
      searchHistory.addEventListener('input', (e) => {
        window.TerraWatchHistory.setFilters(undefined, undefined, e.target.value);
      });
    }
    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => {
        window.TerraWatchHistory.exportCSV();
      });
    }
  }

  populateThresholdsForm() {
    const t = window.TerraWatchConfig.thresholds;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setVal('input-moisture-warn', t.soil_moisture.warning);
    setVal('input-moisture-crit', t.soil_moisture.critical);
    setVal('input-tilt-warn', t.tilt.warning);
    setVal('input-tilt-crit', t.tilt.critical);
    setVal('input-vib-warn', t.vibration.warning);
    setVal('input-vib-crit', t.vibration.critical);
    setVal('input-rain-warn', t.rain.warning);
    setVal('input-rain-crit', t.rain.critical);
  }

  populateMQTTForm() {
    const cfg = window.TerraWatchConfig.mqttConfig;
    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    };

    setVal('input-broker-url', cfg.brokerUrl);
    setVal('input-mqtt-topic', cfg.topicTelemetry);
    setVal('input-client-id', cfg.clientId);
    setVal('input-mqtt-user', cfg.username);
    setVal('input-mqtt-pass', cfg.password);
  }

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(section => {
      section.classList.add('hidden');
    });

    const targetSection = document.getElementById(`tab-${tabName}`);
    if (targetSection) {
      targetSection.classList.remove('hidden');
    }

    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      const isTarget = btn.getAttribute('data-tab') === tabName;
      btn.className = isTarget
        ? 'nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-1.5 transition-all'
        : 'nav-tab-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent flex items-center gap-1.5 transition-all';
    });

    window.TerraWatchConfig.saveUIPrefs({ activeTab: tabName });
    if (window.lucide) window.lucide.createIcons();
  }
}

// Instantiate master app on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.TerraWatchAppInstance = new TerraWatchApp();
  window.TerraWatchAppInstance.init();
});

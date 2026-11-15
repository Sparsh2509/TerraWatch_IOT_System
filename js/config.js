/**
 * TerraWatch - Configuration Module
 * Centralized settings for thresholds, MQTT connection, sensor limits, and UI parameters.
 */

const STORAGE_KEYS = {
  THRESHOLDS: 'terrawatch_thresholds_v2',
  MQTT_CONFIG: 'terrawatch_mqtt_config_v2',
  UI_PREFS: 'terrawatch_ui_prefs_v1'
};

const DEFAULT_THRESHOLDS = {
  soil_moisture: {
    name: 'Soil Moisture',
    unit: '%',
    warning: 65.0,
    critical: 80.0,
    min: 0,
    max: 100,
    description: 'Ground saturation percentage (humidity_pct). >80% indicates liquefaction / slope shear hazard.'
  },
  tilt: {
    name: 'Tilt Angle',
    unit: '°',
    warning: 4.5,
    critical: 8.0,
    min: 0,
    max: 30,
    description: 'Slope inclination shift from calibrated baseline (tilt_deg). >8° indicates structural slip.'
  },
  vibration: {
    name: 'Vibration',
    unit: 'dps',
    warning: 25.0,
    critical: 50.0,
    min: 0,
    max: 150,
    description: 'Peak gyro rotation rate (vibration_dps in deg/s). >50 dps indicates seismic micro-tremor or dynamic slip.'
  },
  rain: {
    name: 'Rain Intensity',
    unit: '%',
    warning: 50.0,
    critical: 80.0,
    min: 0,
    max: 100,
    description: 'Precipitation saturation percentage (rain_pct). >80% indicates rapid groundwater saturation.'
  }
};

const DEFAULT_MQTT_CONFIG = {
  brokerUrl: 'wss://broker.hivemq.com:8884/mqtt',
  port: 8884,
  clientId: 'landslide-node-01',
  username: '',
  password: '',
  topicTelemetry: 'landslide/node01/telemetry',
  topicStatus: 'landslide/node01/status',
  topicAlerts: 'landslide/node01/alerts',
  topicCommands: 'landslide/node01/commands',
  keepalive: 60,
  reconnectPeriod: 4000,
  connectTimeout: 10000
};

const SYSTEM_CONFIG = {
  NODE_TIMEOUT_MS: 10000,       // Mark node OFFLINE if no message received in 10s
  STALE_DATA_TIMEOUT_MS: 6000,   // Show "Sensor Data Stale" warning after 6s
  CHART_MAX_POINTS: 60,          // Rolling history window
  MAX_HISTORY_ROWS: 200,         // Rows kept in local tabular history
  MAX_ALERT_ROWS: 100,           // Maximum log entries in alert panel
  DEFAULT_MODE: 'demo',          // 'real' or 'demo'
  DEMO_INTERVAL_MS: 2000,        // Interval between simulated readings
  AUDIO_ENABLED_DEFAULT: false   // Sound alert on critical/warning
};

class ConfigManager {
  constructor() {
    this.thresholds = this.loadThresholds();
    this.mqttConfig = this.loadMQTTConfig();
    this.uiPrefs = this.loadUIPrefs();
  }

  loadThresholds() {
    let t = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THRESHOLDS);
      if (stored) {
        t = { ...t, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load stored thresholds, falling back to defaults', e);
    }
    // Backward-compatibility aliases for main.py measurement names
    t.humidity_pct = t.soil_moisture;
    t.tilt_deg = t.tilt;
    t.vibration_dps = t.vibration;
    t.rain_pct = t.rain;
    return t;
  }

  saveThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    // Synchronize aliases
    if (this.thresholds.soil_moisture) this.thresholds.humidity_pct = this.thresholds.soil_moisture;
    if (this.thresholds.tilt) this.thresholds.tilt_deg = this.thresholds.tilt;
    if (this.thresholds.vibration) this.thresholds.vibration_dps = this.thresholds.vibration;
    if (this.thresholds.rain) this.thresholds.rain_pct = this.thresholds.rain;

    localStorage.setItem(STORAGE_KEYS.THRESHOLDS, JSON.stringify(this.thresholds));
    window.dispatchEvent(new CustomEvent('terrawatch:thresholds_changed', { detail: this.thresholds }));
  }

  resetThresholds() {
    this.thresholds = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS));
    this.thresholds.humidity_pct = this.thresholds.soil_moisture;
    this.thresholds.tilt_deg = this.thresholds.tilt;
    this.thresholds.vibration_dps = this.thresholds.vibration;
    this.thresholds.rain_pct = this.thresholds.rain;

    localStorage.removeItem(STORAGE_KEYS.THRESHOLDS);
    window.dispatchEvent(new CustomEvent('terrawatch:thresholds_changed', { detail: this.thresholds }));
    return this.thresholds;
  }

  loadMQTTConfig() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MQTT_CONFIG);
      if (stored) {
        return { ...DEFAULT_MQTT_CONFIG, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to load stored MQTT config', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_MQTT_CONFIG));
  }

  saveMQTTConfig(newConfig) {
    this.mqttConfig = { ...this.mqttConfig, ...newConfig };
    localStorage.setItem(STORAGE_KEYS.MQTT_CONFIG, JSON.stringify(this.mqttConfig));
    window.dispatchEvent(new CustomEvent('terrawatch:mqtt_config_changed', { detail: this.mqttConfig }));
  }

  loadUIPrefs() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.UI_PREFS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load UI preferences', e);
    }
    return {
      audioAlerts: SYSTEM_CONFIG.AUDIO_ENABLED_DEFAULT,
      activeMode: SYSTEM_CONFIG.DEFAULT_MODE,
      activeTab: 'overview'
    };
  }

  saveUIPrefs(newPrefs) {
    this.uiPrefs = { ...this.uiPrefs, ...newPrefs };
    localStorage.setItem(STORAGE_KEYS.UI_PREFS, JSON.stringify(this.uiPrefs));
  }
}

// Global singleton instance
window.TerraWatchConfig = new ConfigManager();

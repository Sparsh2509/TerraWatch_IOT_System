/**
 * TerraWatch - Geotechnical Landslide Risk Evaluator
 * Evaluates real-time sensor parameters against threshold limits.
 * Implements strict slope stability criteria according to IoT landslide early warning principles.
 */

const RISK_LEVELS = {
  SAFE: {
    key: 'SAFE',
    label: 'SAFE',
    color: '#10b981', // emerald-500
    badgeClass: 'risk-safe',
    icon: 'shield-check',
    headline: 'SLOPE STABLE',
    summary: 'All monitored parameters are within safe limits. Baseline ground stability maintained.'
  },
  WARNING: {
    key: 'WARNING',
    label: 'WARNING',
    color: '#f59e0b', // amber-500
    badgeClass: 'risk-warning',
    icon: 'alert-triangle',
    headline: 'POTENTIAL INSTABILITY',
    summary: 'Potential slope instability detected. Monitored parameters approaching shear threshold.'
  },
  CRITICAL: {
    key: 'CRITICAL',
    label: 'CRITICAL',
    color: '#ef4444', // red-500
    badgeClass: 'risk-critical',
    icon: 'alert-octagon',
    headline: 'HIGH LANDSLIDE RISK',
    summary: 'Critical slope displacement / saturation threshold breached. Immediate attention required.'
  }
};

class RiskEngine {
  constructor(configManager) {
    this.config = configManager || window.TerraWatchConfig;
    this.previousReading = null;
  }

  getRainCategory(rainValue) {
    if (rainValue === null || rainValue === undefined) return 'UNKNOWN';
    if (typeof rainValue === 'string') {
      const upper = rainValue.toUpperCase();
      if (['LOW', 'MEDIUM', 'HIGH'].includes(upper)) return upper;
      const parsed = parseFloat(rainValue);
      if (!isNaN(parsed)) rainValue = parsed;
    }
    const val = Number(rainValue);
    if (val < 30) return 'LOW';
    if (val < 70) return 'MEDIUM';
    return 'HIGH';
  }

  evaluateSensor(paramKey, value, thresholds) {
    const t = thresholds[paramKey];
    if (!t) return { status: 'SAFE', level: 0, reason: null };

    const numVal = Number(value);
    if (isNaN(numVal)) {
      return { status: 'UNKNOWN', level: -1, reason: `${t.name} data invalid/missing` };
    }

    if (numVal >= t.critical) {
      return {
        status: 'CRITICAL',
        level: 2,
        reason: `${t.name} (${numVal.toFixed(1)} ${t.unit}) exceeded critical threshold (${t.critical} ${t.unit})`
      };
    }

    if (numVal >= t.warning) {
      return {
        status: 'WARNING',
        level: 1,
        reason: `${t.name} (${numVal.toFixed(1)} ${t.unit}) exceeded warning threshold (${t.warning} ${t.unit})`
      };
    }

    return { status: 'SAFE', level: 0, reason: null };
  }

  evaluate(reading) {
    const thresholds = this.config.thresholds;
    const triggers = [];
    let highestLevel = 0; // 0: SAFE, 1: WARNING, 2: CRITICAL

    // Evaluate Soil Moisture
    const moistureEval = this.evaluateSensor('soil_moisture', reading.soil_moisture, thresholds);
    if (moistureEval.level > 0) triggers.push(moistureEval);
    if (moistureEval.level > highestLevel) highestLevel = moistureEval.level;

    // Evaluate Tilt
    const tiltEval = this.evaluateSensor('tilt', reading.tilt, thresholds);
    if (tiltEval.level > 0) triggers.push(tiltEval);
    if (tiltEval.level > highestLevel) highestLevel = tiltEval.level;

    // Evaluate Vibration
    const vibEval = this.evaluateSensor('vibration', reading.vibration, thresholds);
    if (vibEval.level > 0) triggers.push(vibEval);
    if (vibEval.level > highestLevel) highestLevel = vibEval.level;

    // Evaluate Rain
    const rainEval = this.evaluateSensor('rain', reading.rain, thresholds);
    if (rainEval.level > 0) triggers.push(rainEval);
    if (rainEval.level > highestLevel) highestLevel = rainEval.level;

    // Check if edge node explicitly flagged 'critical' = true
    if (reading.critical === true && highestLevel < 2) {
      highestLevel = 2;
      triggers.unshift({
        status: 'CRITICAL',
        level: 2,
        reason: 'Node Critical Alert: ESP32 edge node flagged critical hazard condition!'
      });
    }

    // Compound logic: High Rain + High Soil Moisture can escalate Warning to Critical
    const isHighRain = (Number(reading.rain) >= thresholds.rain.warning) || this.getRainCategory(reading.rain) === 'HIGH';
    const isElevatedMoisture = Number(reading.soil_moisture) >= thresholds.soil_moisture.warning;
    const isElevatedTilt = Number(reading.tilt) >= thresholds.tilt.warning;

    if (isHighRain && isElevatedMoisture && isElevatedTilt && highestLevel < 2) {
      highestLevel = 2; // Compound landslide risk trigger
      triggers.unshift({
        status: 'CRITICAL',
        level: 2,
        reason: 'Compound Trigger: Heavy precipitation combined with active ground saturation and tilt shift!'
      });
    }

    // Determine Overall Risk
    let riskState = RISK_LEVELS.SAFE;
    if (highestLevel === 2) {
      riskState = RISK_LEVELS.CRITICAL;
    } else if (highestLevel === 1) {
      riskState = RISK_LEVELS.WARNING;
    }

    // Trend calculation relative to previous reading
    const trends = this.calculateTrends(reading);
    this.previousReading = { ...reading };

    // Sensor health analysis
    const health = this.evaluateSensorHealth(reading);

    return {
      risk: riskState,
      level: highestLevel,
      triggers: triggers,
      primaryTrigger: triggers.length > 0 ? triggers[0].reason : 'All monitored parameters are within safe limits.',
      sensorStatus: {
        soil_moisture: moistureEval,
        tilt: tiltEval,
        vibration: vibEval,
        rain: rainEval
      },
      rainCategory: this.getRainCategory(reading.rain),
      trends,
      health,
      timestamp: reading.timestamp || new Date().toISOString()
    };
  }

  calculateTrends(current) {
    if (!this.previousReading) {
      return { soil_moisture: 0, tilt: 0, vibration: 0, rain: 0 };
    }
    return {
      soil_moisture: (Number(current.soil_moisture) || 0) - (Number(this.previousReading.soil_moisture) || 0),
      tilt: (Number(current.tilt) || 0) - (Number(this.previousReading.tilt) || 0),
      vibration: (Number(current.vibration) || 0) - (Number(this.previousReading.vibration) || 0),
      rain: (Number(current.rain) || 0) - (Number(this.previousReading.rain) || 0)
    };
  }

  evaluateSensorHealth(reading) {
    const check = (val, min, max) => {
      const n = Number(val);
      if (isNaN(n) || val === null || val === undefined) return { ok: false, label: 'No Signal' };
      if (n < min || n > max) return { ok: false, label: 'Out of Range' };
      return { ok: true, label: 'Normal' };
    };

    return {
      tilt: check(reading.tilt, -45, 90),
      vibration: check(reading.vibration, 0, 500),
      soil_moisture: check(reading.soil_moisture, 0, 100),
      rain: check(reading.rain, 0, 100)
    };
  }
}

window.TerraWatchRiskEngine = new RiskEngine();

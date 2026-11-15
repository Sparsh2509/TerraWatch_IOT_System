/**
 * TerraWatch - Geotechnical Sensor Telemetry Simulator (Demo Mode)
 * Provides realistic geotechnical physics modeling for demonstrations, viva, and offline testing.
 * Strictly separate from Real MQTT mode.
 */

class SensorSimulator {
  constructor(onDataCallback) {
    this.onDataCallback = onDataCallback;
    this.intervalId = null;
    this.currentScenario = 'SAFE'; // 'SAFE', 'WARNING', 'CRITICAL', 'DYNAMIC'
    this.dynamicStep = 0;
    this.isRunning = false;

    // Internal state with smooth Brownian drift matching main.py measurements
    this.state = {
      tilt: 1.8,
      vibration: 6.0,
      soil_moisture: 52.0,
      rain: 12.0
    };
  }

  start(intervalMs = 2000) {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log(`[Simulator] Started DEMO MODE in scenario: ${this.currentScenario}`);
    this.tick();
    this.intervalId = setInterval(() => this.tick(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Simulator] Stopped DEMO MODE');
  }

  setScenario(scenario) {
    this.currentScenario = scenario;
    this.dynamicStep = 0;

    switch (scenario) {
      case 'SAFE':
        this.state = { tilt: 1.8, vibration: 6.0, soil_moisture: 52.0, rain: 12.0 };
        break;
      case 'WARNING':
        this.state = { tilt: 5.2, vibration: 32.0, soil_moisture: 71.5, rain: 58.0 };
        break;
      case 'CRITICAL':
        this.state = { tilt: 8.9, vibration: 64.0, soil_moisture: 84.8, rain: 88.0 };
        break;
      case 'DYNAMIC':
        this.state = { tilt: 1.5, vibration: 5.0, soil_moisture: 45.0, rain: 5.0 };
        break;
    }

    // Immediately emit upon switching scenario
    if (this.isRunning) {
      this.tick();
    }
  }

  tick() {
    let reading;

    if (this.currentScenario === 'DYNAMIC') {
      reading = this.generateDynamicStep();
    } else {
      reading = this.generateStaticScenario();
    }

    if (this.onDataCallback) {
      this.onDataCallback('landslide/node01/telemetry', reading, {
        ...reading,
        simulated: true,
        scenario: this.currentScenario
      });
    }
  }

  generateStaticScenario() {
    const jitter = (range) => (Math.random() - 0.5) * range;

    switch (this.currentScenario) {
      case 'SAFE':
        // Normal baseline
        this.state.tilt = Math.max(0.5, Math.min(3.2, this.state.tilt + jitter(0.2)));
        this.state.vibration = Math.max(1.0, Math.min(15.0, this.state.vibration + jitter(1.5)));
        this.state.soil_moisture = Math.max(45, Math.min(62, this.state.soil_moisture + jitter(0.8)));
        this.state.rain = Math.max(2, Math.min(22, this.state.rain + jitter(2.0)));
        break;

      case 'WARNING':
        // Warning levels: tilt ~5.2°, vibration ~32 dps, moisture ~71%, rain ~58%
        this.state.tilt = Math.max(4.6, Math.min(6.8, this.state.tilt + jitter(0.3)));
        this.state.vibration = Math.max(26.0, Math.min(42.0, this.state.vibration + jitter(3.0)));
        this.state.soil_moisture = Math.max(68, Math.min(76, this.state.soil_moisture + jitter(0.6)));
        this.state.rain = Math.max(52, Math.min(72, this.state.rain + jitter(3.0)));
        break;

      case 'CRITICAL':
        // Critical slope failure (main.py): tilt >8.0°, vibration >50 dps, moisture >80%, rain >80%
        this.state.tilt = Math.max(8.4, Math.min(12.5, this.state.tilt + jitter(0.4)));
        this.state.vibration = Math.max(52.0, Math.min(85.0, this.state.vibration + jitter(5.0)));
        this.state.soil_moisture = Math.max(82, Math.min(92, this.state.soil_moisture + jitter(0.5)));
        this.state.rain = Math.max(82, Math.min(98, this.state.rain + jitter(3.0)));
        break;
    }

    const isCritical = (this.state.tilt >= 8.0) ||
                       (this.state.vibration >= 50.0) ||
                       (this.state.soil_moisture >= 80.0) ||
                       (this.state.rain >= 80.0);

    const tiltVal = Number(this.state.tilt.toFixed(2));
    const vibVal = Number(this.state.vibration.toFixed(2));
    const moistVal = Number(this.state.soil_moisture.toFixed(1));
    const rainVal = Number(this.state.rain.toFixed(1));

    return {
      tilt: tiltVal,
      vibration: vibVal,
      soil_moisture: moistVal,
      rain: rainVal,
      critical: isCritical,
      ts: Math.floor(Date.now() / 1000),
      timestamp: new Date().toISOString(),
      node_id: 'landslide-node-01',
      battery: 98,
      // main.py direct keys
      tilt_deg: tiltVal,
      vibration_dps: vibVal,
      humidity_pct: moistVal,
      rain_pct: rainVal
    };
  }

  generateDynamicStep() {
    this.dynamicStep++;
    // 0-10: Baseline Stable
    // 11-20: Heavy Rain begins, moisture creeps up
    // 21-30: Soil reaches warning saturation, micro-vibrations
    // 31-40: Critical tilt shift occurs! (Landslide trigger)
    // 41-50: Recovery / drainage back to baseline
    const step = this.dynamicStep % 50;

    if (step <= 10) {
      // Baseline
      this.state.rain = 8 + Math.random() * 8;
      this.state.soil_moisture = 48 + Math.random() * 4;
      this.state.vibration = 4.0 + Math.random() * 3.0;
      this.state.tilt = 1.4 + Math.random() * 0.4;
    } else if (step <= 20) {
      // Monsoon storm starts
      this.state.rain = 40 + (step - 10) * 3.5;
      this.state.soil_moisture = 52 + (step - 10) * 1.5;
      this.state.vibration = 10.0 + (step - 10) * 1.5 + Math.random() * 4.0;
      this.state.tilt = 2.2 + Math.random() * 0.5;
    } else if (step <= 30) {
      // High saturation warning
      this.state.rain = 70 + Math.random() * 8;
      this.state.soil_moisture = 68 + (step - 20) * 0.9;
      this.state.vibration = 26.0 + (step - 20) * 1.5;
      this.state.tilt = 4.8 + (step - 20) * 0.22;
    } else if (step <= 40) {
      // CRITICAL SHEAR FAILURE (main.py: tilt >= 8.0, vib >= 50.0, moisture >= 80, rain >= 80)
      this.state.rain = 84 + Math.random() * 12;
      this.state.soil_moisture = 83 + Math.random() * 5;
      this.state.vibration = 55.0 + Math.random() * 25.0;
      this.state.tilt = 8.5 + (step - 30) * 0.35;
    } else {
      // Drainage / stabilizing
      const progress = (step - 40) / 10;
      this.state.rain = 30 * (1 - progress) + 8;
      this.state.soil_moisture = 75 * (1 - progress) + 50;
      this.state.vibration = 25 * (1 - progress) + 5.0;
      this.state.tilt = 6 * (1 - progress) + 1.8;
    }

    const isCritical = (this.state.tilt >= 8.0) ||
                       (this.state.vibration >= 50.0) ||
                       (this.state.soil_moisture >= 80.0) ||
                       (this.state.rain >= 80.0);

    const tiltVal = Number(this.state.tilt.toFixed(2));
    const vibVal = Number(this.state.vibration.toFixed(2));
    const moistVal = Number(this.state.soil_moisture.toFixed(1));
    const rainVal = Number(this.state.rain.toFixed(1));

    return {
      tilt: tiltVal,
      vibration: vibVal,
      soil_moisture: moistVal,
      rain: rainVal,
      critical: isCritical,
      ts: Math.floor(Date.now() / 1000),
      timestamp: new Date().toISOString(),
      node_id: 'landslide-node-01',
      battery: 95,
      // main.py direct keys
      tilt_deg: tiltVal,
      vibration_dps: vibVal,
      humidity_pct: moistVal,
      rain_pct: rainVal
    };
  }
}

window.TerraWatchSimulator = new SensorSimulator();

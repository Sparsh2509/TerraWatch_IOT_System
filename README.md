# TerraWatch – An Advanced IoT-Based Landslide Detection System
### Real-Time Geotechnical Monitoring & Early-Warning Control Room Dashboard

![TerraWatch Badge](https://img.shields.io/badge/System-TerraWatch_v2.4-emerald)
![Protocol](https://img.shields.io/badge/Protocol-MQTT_over_WebSockets-blue)
![Microcontroller](https://img.shields.io/badge/Hardware-ESP32-red)
![Status](https://img.shields.io/badge/Status-Operational-brightgreen)

---

## 1. Project Overview & Core Concept
**TerraWatch** is an industrial-grade geotechnical monitoring and early-warning dashboard designed for real-time landslide detection and slope stability evaluation. 

The system continuously acquires and evaluates four critical physical indicators:
1. **Ground Inclination / Tilt Shift (`tilt_deg` in °)** – Measured via MPU6050 3-axis accelerometer/inclinometer.
2. **Micro-Tremor & Peak Vibration (`vibration_dps` in deg/s)** – Measured via MPU6050 3-axis gyroscope rate.
3. **Soil Moisture Saturation (`humidity_pct` in %)** – Measured via capacitive/resistive soil moisture sensor.
4. **Rainfall Saturation (`rain_pct` in %)** – Measured via precipitation sensor plate.

An **ESP32 microcontroller** samples and filters sensor telemetry, evaluates safety thresholds locally (actuating on-site piezoceramic buzzers and tri-color LEDs), and publishes telemetry frames via **MQTT**. The **TerraWatch Web Dashboard** subscribes to telemetry over WebSockets to render high-resolution real-time time-series streams, triggering instant visual, tabular, and audio alerts.

---

## 2. System Architecture

```
+-------------------------------------------------------------+
|                     GEOTECHNICAL SENSORS                    |
|  - MPU-6050 (Tilt / Incline)       - Capacitive Soil Sensor |
|  - SW-420 (Vibration / Seismic)    - FC-37 / Rain Gauge     |
+------------------------------+------------------------------+
                               | Analog / I2C Signals
                               v
+-------------------------------------------------------------+
|                       ESP32 EDGE NODE                       |
|  - Analog Calibration & Kalman Tilt Filtering               |
|  - Local Actuators: Piezo Buzzer & Tri-Color Status LEDs    |
|  - JSON Serialization                                       |
+------------------------------+------------------------------+
                               | MQTT Publish (TCP Port 1883)
                               v
+-------------------------------------------------------------+
|                      MQTT BROKER                            |
|  - Mosquitto (Local) or HiveMQ / EMQX (Cloud)               |
|  - Standard MQTT Port: 1883 (ESP32)                         |
|  - WebSocket Port: 9001 or 8884 (Browser)                   |
+------------------------------+------------------------------+
                               | MQTT Subscribe (WebSockets)
                               v
+-------------------------------------------------------------+
|                 TERRAWATCH WEB DASHBOARD                    |
|  - Dominant Landslide Risk Engine (SAFE / WARNING / CRIT)   |
|  - 4 Live Interactive Time-Series Charts (Chart.js)         |
|  - Real-time Alert Ledger & Synthetic Web Audio Siren       |
|  - 200-Reading Rolling History Table & CSV Export           |
|  - Full Offline Simulation / Viva Demonstration Engine      |
+-------------------------------------------------------------+
```

---

## 3. Risk States & Geotechnical Thresholds

The system operates across three defined risk states based on geotechnical failure criteria:

| Risk State | Indicator | Description | Trigger Example |
| :--- | :--- | :--- | :--- |
| **SAFE** | 🟢 Green | Baseline slope stability. All sensors below warning limits. | Moisture < 65%, Tilt < 4.5° |
| **WARNING** | 🟠 Amber | Potential slope instability or heavy infiltration detected. | Moisture > 65% or Tilt > 4.5° |
| **CRITICAL** | 🔴 Red | High landslide risk. Liquefaction or structural shear slip imminent. | Moisture > 80% or Tilt > 8.0° |

### Default Configurable Limits (matching main.py)
- **Soil Moisture / Humidity (`humidity_pct`)**: Warning: `65.0%` | Critical: `80.0%` (`HUMIDITY_CRITICAL_PCT`)
- **Tilt Angle (`tilt_deg`)**: Warning: `4.5°` | Critical: `8.0°` (`TILT_CRITICAL_DEG`, `CRITICAL_HYSTERESIS_DEG = 1.0`)
- **Vibration (`vibration_dps`)**: Warning: `25.0 dps` | Critical: `50.0 dps` (`VIBRATION_CRITICAL_DPS`)
- **Rainfall (`rain_pct`)**: Warning: `50.0%` | Critical: `80.0%` (`RAIN_CRITICAL_PCT`)

---

## 4. How to Run the Dashboard

The dashboard has **zero external build dependencies**. It runs in any modern browser.

### Option A: 1-Click Launch (Windows)
Double-click `run_dashboard.bat`. This automatically starts the local Python web server and opens your browser.

### Option B: Command Line (Python)
```bash
python server.py
```
Then navigate to: `http://localhost:3000`

### Option C: Direct File Access
You can also open `index.html` directly in any modern browser (Chrome, Edge, Firefox, Safari).

---

## 5. REAL MQTT MODE vs DEMO MODE

TerraWatch includes a seamless mode toggle in the top header:

### ⚡ DEMO MODE (Presentation & Viva)
- Designed for viva examinations, classroom demonstrations, or testing when physical hardware is not present.
- Uses realistic geotechnical physics modeling with 4 selectable scenarios:
  1. **Safe Slope**: Baseline stable slope conditions.
  2. **Infiltration Warning**: Simulates heavy monsoon rain increasing soil saturation and micro-vibrations.
  3. **Critical Failure**: Simulates acute structural shear slip (>8.0° tilt, >80% moisture, >50 dps vibration spike).
  4. **Dynamic Cycle**: A progressive 50-step simulation transitioning from stable dry soil → monsoon infiltration → acute shear slip → drainage recovery.

### 📡 REAL MQTT MODE
- In this mode, simulated data is completely stopped. Telemetry is received **exclusively** from the live MQTT broker via WebSockets.
- If the broker disconnects or no message is received for 10 seconds, the watchdog marks the node as **OFFLINE** and displays a prominent warning.

---

## 6. MQTT Configuration & Topics

### Topic Structure
- **Telemetry Stream (ESP32 → Dashboard)**: `landslide/node01/telemetry`
- **Node Status & Heartbeat (ESP32 → Dashboard)**: `landslide/node01/status`
- **Dashboard Command & Test Actuation (Dashboard → ESP32)**: `landslide/node01/commands`
- **Hardware Alarm Broadcast**: `landslide/node01/alerts`

### Expected JSON Telemetry Payload (from main.py)
The ESP32 publishes standard JSON formatted as:
```json
{
  "tilt_deg": 3.2,
  "vibration_dps": 14.5,
  "humidity_pct": 67,
  "rain_pct": 42,
  "critical": false,
  "ts": 1773663045.12
}
```

---

## 7. Connecting Physical ESP32 Hardware

The repository includes a complete, production-ready Arduino C++ firmware in [arduino/TerraWatch_ESP32.ino](file:///c:/Users/HP/Desktop/Abhishek_Project_Dashboard/arduino/TerraWatch_ESP32.ino).

### Pin Wiring Diagram
| Sensor / Component | ESP32 GPIO Pin | Protocol / Signal |
| :--- | :--- | :--- |
| **MPU-6050 SDA** | GPIO 21 | I2C Data |
| **MPU-6050 SCL** | GPIO 22 | I2C Clock |
| **Capacitive Soil Moisture** | GPIO 32 | Analog Input (ADC1) |
| **Rain Gauge / Plate** | GPIO 33 | Analog Input (ADC1) |
| **SW-420 Vibration Sensor** | GPIO 35 | Analog / Digital Input |
| **Piezoelectric Buzzer** | GPIO 25 | Digital Output (PWM / Active) |
| **Status LED (Green)** | GPIO 18 | Digital Output |
| **Status LED (Amber)** | GPIO 19 | Digital Output |
| **Status LED (Red)** | GPIO 23 | Digital Output |
| **Evacuation Relay** | GPIO 26 | Digital Output |

### Required Arduino Libraries
Install via Arduino IDE Library Manager:
- `PubSubClient` by Nick O'Leary
- `ArduinoJson` by Benoit Blanchon (v6 or v7)
- `Wire` (built-in)

---

## 8. Running with a Local Mosquitto MQTT Broker

Browsers connect to MQTT using **WebSockets**, while the ESP32 connects using standard **TCP MQTT**. Mosquitto supports both simultaneously!

A configuration file is provided in [mosquitto/mosquitto.conf](file:///c:/Users/HP/Desktop/Abhishek_Project_Dashboard/mosquitto/mosquitto.conf):

```conf
# Standard TCP listener for ESP32
listener 1883
protocol mqtt

# WebSocket listener for TerraWatch Web Dashboard
listener 9001
protocol websockets

allow_anonymous true
```

### Starting Local Mosquitto:
```bash
mosquitto -c mosquitto/mosquitto.conf -v
```

In the dashboard, click the **Radio Settings** icon and select **Local Mosquitto** (`ws://localhost:9001`).

---

## 9. Testing REAL MQTT Mode without Hardware

To test live MQTT streaming from a PC, run the included Python test publisher:

```bash
# 1. Install paho-mqtt
pip install paho-mqtt

# 2. Run the test publisher
python tools/simulate_mqtt_stream.py safe
# or:
python tools/simulate_mqtt_stream.py warning
python tools/simulate_mqtt_stream.py critical
python tools/simulate_mqtt_stream.py dynamic
```

The dashboard in **REAL MQTT MODE** will instantly react to these published packets in real time!

---

## 10. Modifying Thresholds
1. **Through the UI**: Click the **Sliders icon** in the top header. You can edit Warning and Critical thresholds for all 4 parameters. Changes are stored in `localStorage` and immediately update the risk evaluation engine and live chart reference lines.
2. **Through Code**: Edit `DEFAULT_THRESHOLDS` in [js/config.js](file:///c:/Users/HP/Desktop/Abhishek_Project_Dashboard/js/config.js).

---

## 11. Code Structure

```
Abhishek_Project_Dashboard/
├── index.html                   # Master single-page application interface
├── server.py                    # Local HTTP development server
├── run_dashboard.bat            # 1-click Windows runner
├── README.md                    # Comprehensive technical documentation
├── css/
│   └── styles.css               # Dark industrial geotechnical design system
├── js/
│   ├── config.js                # Centralized threshold & MQTT configuration
│   ├── audio-alerts.js          # Web Audio API synthetic buzzer sound generator
│   ├── risk-engine.js           # Slope stability evaluation & trigger breakdown
│   ├── mqtt-client.js           # Robust MQTT over WebSockets client
│   ├── simulator.js             # Realistic 4-scenario geotechnical simulator
│   ├── charts-manager.js        # 4 synchronized real-time Chart.js streams
│   ├── alerts-manager.js        # Chronological alert ledger with severity filtering
│   ├── history-manager.js       # Tabular history log with CSV exporter
│   └── app.js                   # Master coordinator & UI event lifecycle
├── arduino/
│   └── TerraWatch_ESP32.ino     # Complete ESP32 C++ firmware with local actuators
├── mosquitto/
│   └── mosquitto.conf           # Mosquitto broker dual-listener configuration
└── tools/
    └── simulate_mqtt_stream.py  # Python MQTT test publisher
```

---
**TerraWatch** – Built for Engineering Capstone Demonstration & Geotechnical Early Warning.

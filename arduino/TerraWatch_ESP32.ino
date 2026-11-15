/**
 * ============================================================================
 * TerraWatch - IoT-Based Landslide Early Warning System
 * ESP32 Sensor Acquisition, Filtering, Local Actuation, and MQTT Telemetry
 * ============================================================================
 * Hardware Pin Connections:
 *  - MPU-6050 (Tilt / Inclination)  : SDA -> GPIO 21, SCL -> GPIO 22 (I2C)
 *  - SW-420 / Vibration Sensor      : Analog -> GPIO 35 (or Digital GPIO 14)
 *  - Capacitive Soil Moisture v1.2  : Analog -> GPIO 32 (ADC1)
 *  - Rain Sensor (FC-37 / Gauge)    : Analog -> GPIO 33 (ADC1)
 *  - Local Piezo Buzzer             : GPIO 25 (Active buzzer / PWM tone)
 *  - Status LEDs                    : Green -> GPIO 18, Amber -> GPIO 19, Red -> GPIO 23
 *  - Evacuation Relay / Siren       : GPIO 26
 *
 * MQTT Architecture:
 *  - Publishes telemetry to: landslide/node01/telemetry (JSON)
 *  - Subscribes to commands: landslide/node01/commands
 *  - Publishes heartbeat to: landslide/node01/status
 * ============================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <math.h>

// --- Network & MQTT Settings ---
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
const char* MQTT_BROKER   = "broker.hivemq.com"; // Standard public broker
const int   MQTT_PORT     = 1883;               // Standard TCP MQTT port
const char* MQTT_CLIENT_ID = "landslide-node-01";
const char* TOPIC_SENSORS = "landslide/node01/telemetry";
const char* TOPIC_COMMANDS= "landslide/node01/commands";
const char* TOPIC_STATUS  = "landslide/node01/status";

// --- Hardware Pins ---
#define PIN_MOISTURE_ADC   34
#define PIN_RAIN_ADC       35
#define PIN_VIBRATION_ADC  32
#define PIN_BUZZER         25
#define PIN_LED_GREEN      18
#define PIN_LED_AMBER      19
#define PIN_LED_RED        23
#define PIN_RELAY          26

// --- MPU6050 I2C Address ---
const int MPU_ADDR = 0x68;

// --- Calibration Baseline Values (matching main.py) ---
const int SOIL_DRY_RAW = 4095;  // Dry raw ADC reading
const int SOIL_WET_RAW = 1500;  // Wet submerged raw ADC reading
const int RAIN_DRY_RAW = 4095;  // Dry plate raw ADC reading
const int RAIN_WET_RAW = 1000;  // Wet saturated raw ADC reading

// --- Safety Thresholds (matching main.py constants) ---
float TILT_CRITICAL_DEG       = 8.0;
float VIBRATION_CRITICAL_DPS  = 50.0;     // peak gyro rate in deg/s
float HUMIDITY_CRITICAL_PCT   = 80.0;     // soil moisture probe percentage
float RAIN_CRITICAL_PCT       = 80.0;     // rain plate percentage
float CRITICAL_HYSTERESIS_DEG = 1.0;     // hysteresis on tilt

// Warning thresholds
float TILT_WARN_DEG           = 4.5;
float VIBRATION_WARN_DPS      = 25.0;
float HUMIDITY_WARN_PCT       = 65.0;
float RAIN_WARN_PCT           = 50.0;

WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 2000; // 2 seconds

// Initial MPU6050 calibration baseline
float baselinePitch = 0.0;
float baselineRoll = 0.0;

// Function declarations
void setupHardware();
void connectWiFi();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
float readSoilMoisture();
float readRainfall();
float readVibration();
float readMPU6050Tilt();
bool evaluateLocalAlerts(float tilt_deg, float vib_dps, float humidity_pct, float rain_pct);

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[TerraWatch] Initializing Geotechnical Node...");

  setupHardware();
  connectWiFi();

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  // Initialize MPU-6050
  Wire.begin(21, 22);
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1 register
  Wire.write(0);    // Wake up MPU
  Wire.endTransmission(true);

  delay(200);
  // Calibrate initial reference baseline angle
  baselinePitch = readMPU6050Tilt();
  Serial.print("[TerraWatch] Initial Calibrated Tilt Baseline: ");
  Serial.print(baselinePitch);
  Serial.println(" deg");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = currentMillis;

    // 1. Acquire sensor readings
    float humidity_pct = readSoilMoisture();
    float rain_pct = readRainfall();
    float vibration_dps = readVibration();
    float currentTilt = readMPU6050Tilt();
    float tilt_deg = fabs(currentTilt - baselinePitch);

    // 2. Perform local safety evaluation (matching main.py evaluate_critical)
    bool isCritical = evaluateLocalAlerts(tilt_deg, vibration_dps, humidity_pct, rain_pct);

    // 3. Serialize and publish JSON telemetry matching main.py payload
    StaticJsonDocument<256> doc;
    doc["tilt_deg"] = serialized(String(tilt_deg, 2));
    doc["vibration_dps"] = serialized(String(vibration_dps, 2));
    doc["humidity_pct"] = serialized(String(humidity_pct, 1));
    doc["rain_pct"] = serialized(String(rain_pct, 1));
    doc["critical"] = isCritical;
    doc["ts"] = currentMillis / 1000;
    doc["node_id"] = MQTT_CLIENT_ID;

    // Backward-compatible aliases
    doc["tilt"] = serialized(String(tilt_deg, 2));
    doc["vibration"] = serialized(String(vibration_dps, 2));
    doc["soil_moisture"] = serialized(String(humidity_pct, 1));
    doc["rain"] = serialized(String(rain_pct, 1));

    char buffer[256];
    serializeJson(doc, buffer);

    if (mqttClient.publish(TOPIC_SENSORS, buffer)) {
      Serial.print("[MQTT Publish] -> ");
      Serial.println(buffer);
    } else {
      Serial.println("[MQTT Publish] Failed to send packet.");
    }
  }
}

void setupHardware() {
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_AMBER, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_RELAY, OUTPUT);

  digitalWrite(PIN_BUZZER, LOW);
  digitalWrite(PIN_LED_GREEN, HIGH);
  digitalWrite(PIN_LED_AMBER, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_RELAY, LOW);
}

void connectWiFi() {
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] Connection timeout. Retrying in loop...");
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Attempting connection to " + String(MQTT_BROKER) + "...");
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println(" CONNECTED!");
      mqttClient.subscribe(TOPIC_COMMANDS);
      
      // Send birth status message
      mqttClient.publish(TOPIC_STATUS, "{\"status\":\"ONLINE\",\"device\":\"ESP32_TerraWatch\"}");
    } else {
      Serial.print(" Failed (rc=");
      Serial.print(mqttClient.state());
      Serial.println("). Retrying in 4s...");
      delay(4000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) message += (char)payload[i];
  Serial.printf("[MQTT RX] %s: %s\n", topic, message.c_str());

  if (String(topic) == TOPIC_COMMANDS) {
    StaticJsonDocument<200> doc;
    DeserializationError error = deserializeJson(doc, message);
    if (!error) {
      const char* action = doc["action"];
      if (String(action) == "BUZZER_TEST") {
        Serial.println("[Command] Executing Buzzer Test!");
        digitalWrite(PIN_BUZZER, HIGH);
        digitalWrite(PIN_LED_RED, HIGH);
        delay(1200);
        digitalWrite(PIN_BUZZER, LOW);
        digitalWrite(PIN_LED_RED, LOW);
      }
    }
  }
}

float readSoilMoisture() {
  int raw = analogRead(PIN_MOISTURE_ADC);
  // Calibrated inversion: dry = high raw, wet = low raw
  float pct = map(raw, SOIL_DRY_RAW, SOIL_WET_RAW, 0, 100);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

float readRainfall() {
  int raw = analogRead(PIN_RAIN_ADC);
  // Calibrated inversion: dry = 4095, wet = 1000 (matching main.py to_pct)
  float pct = map(raw, RAIN_DRY_RAW, RAIN_WET_RAW, 0, 100);
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return pct;
}

float readVibration() {
  // Read MPU6050 gyroscope to compute peak angular velocity in deg/s (dps)
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x43); // Gyro X register
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  int16_t GyX = Wire.read() << 8 | Wire.read();
  int16_t GyY = Wire.read() << 8 | Wire.read();
  int16_t GyZ = Wire.read() << 8 | Wire.read();

  // +-250 deg/s range -> 131.0 LSB per deg/s
  float gx = GyX / 131.0;
  float gy = GyY / 131.0;
  float gz = GyZ / 131.0;
  return sqrt(gx * gx + gy * gy + gz * gz);
}

float readMPU6050Tilt() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B); // Accel data register
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 6, true);

  int16_t AcX = Wire.read() << 8 | Wire.read();
  int16_t AcY = Wire.read() << 8 | Wire.read();
  int16_t AcZ = Wire.read() << 8 | Wire.read();

  // Calculate pitch/tilt in degrees
  float ax = AcX / 16384.0;
  float ay = AcY / 16384.0;
  float az = AcZ / 16384.0;

  float tiltAngle = atan2(ay, sqrt(ax * ax + az * az)) * 180.0 / PI;
  return tiltAngle;
}

bool evaluateLocalAlerts(float tilt_deg, float vib_dps, float humidity_pct, float rain_pct) {
  tilt_deg = fabs(tilt_deg);
  bool isCritical = (tilt_deg >= TILT_CRITICAL_DEG) || 
                    (vib_dps >= VIBRATION_CRITICAL_DPS) || 
                    (humidity_pct >= HUMIDITY_CRITICAL_PCT) ||
                    (rain_pct >= RAIN_CRITICAL_PCT);

  bool isWarning = (tilt_deg >= TILT_WARN_DEG) || 
                   (vib_dps >= VIBRATION_WARN_DPS) || 
                   (humidity_pct >= HUMIDITY_WARN_PCT) ||
                   (rain_pct >= RAIN_WARN_PCT);

  if (isCritical) {
    // 🚨 CRITICAL LOCAL STATE
    digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_AMBER, LOW);
    digitalWrite(PIN_LED_RED, HIGH);
    digitalWrite(PIN_BUZZER, HIGH); // Continuous sounding alarm
    digitalWrite(PIN_RELAY, HIGH);  // Trigger external siren
  } else if (isWarning) {
    // 🟠 WARNING STATE
    digitalWrite(PIN_LED_GREEN, LOW);
    digitalWrite(PIN_LED_AMBER, HIGH);
    digitalWrite(PIN_LED_RED, LOW);
    digitalWrite(PIN_RELAY, LOW);

    // Intermittent warning beep
    digitalWrite(PIN_BUZZER, HIGH);
    delay(100);
    digitalWrite(PIN_BUZZER, LOW);
  } else {
    // 🟢 SAFE STATE
    digitalWrite(PIN_LED_GREEN, HIGH);
    digitalWrite(PIN_LED_AMBER, LOW);
    digitalWrite(PIN_LED_RED, LOW);
    digitalWrite(PIN_BUZZER, LOW);
    digitalWrite(PIN_RELAY, LOW);
  }
  return isCritical;
}

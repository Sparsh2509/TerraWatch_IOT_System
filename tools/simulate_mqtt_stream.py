"""
TerraWatch - External Python MQTT Publisher Simulator
Simulates physical ESP32 telemetry by publishing directly to an MQTT broker.
Useful for testing REAL MQTT MODE from a PC before uploading code to ESP32.

Requirements:
    pip install paho-mqtt
Usage:
    python tools/simulate_mqtt_stream.py [scenario]
    Scenarios: safe, warning, critical, dynamic
"""

import sys
import time
import json
import random
from datetime import datetime

try:
    import paho.mqtt.client as mqtt
except ImportError:
    print("\n[!] 'paho-mqtt' package is required to run this script.")
    print("    Install it via: pip install paho-mqtt\n")
    sys.exit(1)

BROKER = "broker.hivemq.com"
PORT = 1883
TOPIC = "landslide/node01/telemetry"

scenario = sys.argv[1].lower() if len(sys.argv) > 1 else "safe"
print(f"[TerraWatch] Starting MQTT test publisher in scenario: {scenario.upper()}")
print(f"[TerraWatch] Publishing to {BROKER}:{PORT} on topic '{TOPIC}'...")

try:
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id=f"landslide-node-01-{random.randint(100,999)}")
except (AttributeError, TypeError):
    client = mqtt.Client(client_id=f"landslide-node-01-{random.randint(100,999)}")

def on_connect(c, userdata, flags, rc):
    if rc == 0:
        print("[MQTT] Connected successfully to broker.")
    else:
        print(f"[MQTT] Connection failed with code {rc}")

client.on_connect = on_connect
client.connect(BROKER, PORT, 60)
client.loop_start()

step = 0
try:
    while True:
        step += 1
        now_ts = time.time()
        now_iso = datetime.utcnow().isoformat() + "Z"

        if scenario == "critical":
            tilt_deg = round(8.4 + random.uniform(0.1, 3.2), 2)
            vib_dps = round(52.0 + random.uniform(2.0, 30.0), 2)
            moisture_pct = int(round(82.5 + random.uniform(0.2, 8.5)))
            rain_pct = int(round(85.0 + random.uniform(1.0, 10.0)))
        elif scenario == "warning":
            tilt_deg = round(4.8 + random.uniform(0.1, 1.8), 2)
            vib_dps = round(28.0 + random.uniform(1.0, 15.0), 2)
            moisture_pct = int(round(71.0 + random.uniform(0.5, 5.0)))
            rain_pct = int(round(56.0 + random.uniform(2.0, 12.0)))
        elif scenario == "dynamic":
            s = step % 40
            if s < 10:
                tilt_deg, vib_dps, moisture_pct, rain_pct = 1.6, 5.2, 48, 10
            elif s < 20:
                tilt_deg, vib_dps, moisture_pct, rain_pct = 2.4, 15.8, 58, 42
            elif s < 30:
                tilt_deg, vib_dps, moisture_pct, rain_pct = 5.2, 32.5, 73, 68
            else:
                tilt_deg, vib_dps, moisture_pct, rain_pct = 9.2, 58.4, 86, 92
        else: # safe
            tilt_deg = round(1.5 + random.uniform(-0.3, 0.5), 2)
            vib_dps = round(6.5 + random.uniform(-2.0, 4.0), 2)
            moisture_pct = int(round(52.0 + random.uniform(-2.0, 3.0)))
            rain_pct = int(round(12.0 + random.uniform(-2.0, 5.0)))

        is_critical = (
            abs(tilt_deg) >= 8.0
            or vib_dps >= 50.0
            or moisture_pct >= 80
            or rain_pct >= 80
        )

        payload = {
            "tilt_deg": tilt_deg,
            "vibration_dps": vib_dps,
            "humidity_pct": moisture_pct,
            "rain_pct": rain_pct,
            "critical": is_critical,
            "ts": now_ts,
            # Backward-compatible fields
            "tilt": tilt_deg,
            "vibration": vib_dps,
            "soil_moisture": moisture_pct,
            "rain": rain_pct,
            "timestamp": now_iso,
            "node_id": "landslide-node-01"
        }

        json_str = json.dumps(payload)
        client.publish(TOPIC, json_str)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Published: {json_str}")
        time.sleep(2.0)

except KeyboardInterrupt:
    print("\nStopping MQTT publisher...")
    client.loop_stop()
    client.disconnect()

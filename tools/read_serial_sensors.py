"""
TerraWatch - Direct USB Serial to Dashboard Bridge (NO WiFi Needed)
Reads JSON sensor telemetry directly from ESP32/Arduino over USB Cable (COM port)
and forwards it directly to the local dashboard.

Usage:
    python tools/read_serial_sensors.py [COM_PORT] [BAUD_RATE]
    Example: python tools/read_serial_sensors.py COM3 115200
"""

import sys
import time
import json
import serial
import serial.tools.list_ports

try:
    import paho.mqtt.client as mqtt
except ImportError:
    mqtt = None

def get_default_port():
    ports = list(serial.tools.list_ports.comports())
    if not ports:
        return None
    for p in ports:
        if "CP210" in p.description or "CH340" in p.description or "USB" in p.description or "ESP32" in p.description:
            return p.device
    return ports[0].device

def main():
    port = sys.argv[1] if len(sys.argv) > 1 else get_default_port()
    baud = int(sys.argv[2]) if len(sys.argv) > 2 else 115200

    print("=" * 65)
    print(" TERRAWATCH - DIRECT USB SERIAL SENSOR BRIDGE (NO WIFI NEEDED)")
    print("=" * 65)

    if not port:
        print("\n[!] No USB Serial COM ports detected.")
        print("    Plug your ESP32 or Arduino into your computer with a USB cable.")
        print("    Available ports:")
        for p in serial.tools.list_ports.comports():
            print(f"      - {p.device}: {p.description}")
        print("\nRun: python tools/read_serial_sensors.py <COM_PORT>")
        sys.exit(1)

    print(f" Connecting to USB device on {port} at {baud} baud...")

    try:
        ser = serial.Serial(port, baud, timeout=1.0)
        time.sleep(2.0) # Wait for device to reset after serial connection
        print(f"[✓] Connected to {port}! Reading sensor data directly from USB cable...")
    except Exception as e:
        print(f"[!] Error opening {port}: {e}")
        sys.exit(1)

    # Optional local MQTT bridge (if local broker is active)
    client = None
    if mqtt:
        try:
            try:
                client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, client_id="landslide-serial-bridge")
            except (AttributeError, TypeError):
                client = mqtt.Client(client_id="landslide-serial-bridge")
            client.connect("localhost", 1883, 60)
            client.loop_start()
            print("[✓] Connected to local MQTT broker at localhost:1883")
        except Exception:
            # Fallback to HiveMQ public broker if local broker not active
            try:
                client.connect("broker.hivemq.com", 1883, 60)
                client.loop_start()
                print("[✓] Connected to broker.hivemq.com:1883")
            except Exception:
                client = None

    print("\n[Streaming sensor telemetry directly to dashboard... Press Ctrl+C to stop]\n")

    try:
        while True:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            if not line:
                continue

            # Check if line is valid JSON
            if line.startswith('{') and line.endswith('}'):
                try:
                    payload = json.loads(line)
                    print(f"[{time.strftime('%H:%M:%S')}] USB Sensor Telemetry: {payload}")
                    if client:
                        # Ensure main.py measurement names are populated
                        if "tilt_deg" not in payload and "tilt" in payload:
                            payload["tilt_deg"] = payload["tilt"]
                        if "vibration_dps" not in payload and "vibration" in payload:
                            payload["vibration_dps"] = payload["vibration"]
                        if "humidity_pct" not in payload and "soil_moisture" in payload:
                            payload["humidity_pct"] = payload["soil_moisture"]
                        if "rain_pct" not in payload and "rain" in payload:
                            payload["rain_pct"] = payload["rain"]
                        if "ts" not in payload:
                            payload["ts"] = time.time()
                        client.publish("landslide/node01/telemetry", json.dumps(payload))
                except json.JSONDecodeError:
                    print(f"Raw Serial: {line}")
            else:
                if line:
                    print(f"Device Log: {line}")

    except KeyboardInterrupt:
        print("\nStopping USB Serial bridge...")
        ser.close()
        if client:
            client.loop_stop()
        sys.exit(0)

if __name__ == "__main__":
    main()

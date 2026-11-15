"""
IoT Landslide Detection & Early Warning System -- MicroPython (ESP32)

Reads tilt + vibration (MPU6050), soil moisture and rainfall, then sends
the readings to HiveMQ over WiFi + MQTT. If WiFi/MQTT fails, the same
reading goes out as a LoRaWAN uplink to The Things Network (ABP, uLoRa,
SX1278 Ra-02 on 433 MHz). A local buzzer sounds whenever any value is
critical, whether or not either network path works.

FILES TO UPLOAD TO THE ESP32
  landslide.py (this file; name it main.py to auto-run at power-up)
  umqtt/simple.py   (or umqtt_file.py, either name is found)
  ulora.py, ulora_encryption.py, ttn_eu433.py   (the patched copies)
  Without the ulora files the program still runs, LoRa is just skipped.

WIRING
  MPU6050   : VCC=3V3, GND, SDA=GPIO21, SCL=GPIO22, AD0=GND
  Soil probe: VCC=3V3 (or PIN_SOIL_POWER), GND, A0=GPIO34
  Rain      : VCC=3V3, GND, AO=GPIO35
  Buzzer    : + = GPIO25, - = GND (active buzzer)
  Ra-02     : 3.3V, GND, NSS=GPIO5, SCK=GPIO18, MOSI=GPIO23,
              MISO=GPIO19, RESET=GPIO14, DIO0=GPIO2,
              ANT = 433 MHz antenna (about 17 cm of wire for testing)

TTN CONSOLE SETTINGS
  - Device frequency plan: Europe 433 MHz (matches LORA_REGION below)
  - Activation: ABP. Copy DevAddr / NwkSKey / AppSKey into the constants.
  - Enable the "Resets frame counters" option for this device (wording
    varies by console version). The frame counter restarts at 0 whenever
    the ESP32 reboots, and TTN rejects uplinks that go backwards.
  - Payload formatter expects 6 bytes: tilt*100 (uint16), vibration,
    soil moisture, rain, critical flag.
"""

import time
import math
import ujson
import ubinascii
from machine import Pin, I2C, ADC, unique_id
import network

try:
    from umqtt_file import MQTTClient
except ImportError:
    MQTTClient = None

# ----------------------------------------------------------------------
# CONFIG
# ----------------------------------------------------------------------

# True: read every 5 seconds (bench testing). False: every 5 minutes.
BENCH_TEST = True
POLL_INTERVAL_S = 5 if BENCH_TEST else 300

WIFI_SSID = "YOUR_WIFI_NAME"
WIFI_PASS = "YOUR_WIFI_PASSWORD"
WIFI_CONNECT_TIMEOUT_S = 10

# HiveMQ public broker (anyone can read it; fine for a demo only).
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "landslide-node-01"
MQTT_TOPIC = b"landslide/node01/telemetry"

# TTN ABP credentials. Re-copy them if TTN regenerates the keys after you
# change the device's frequency plan.
TTN_DEVADDR = bytearray([0x26, 0x0D, 0xB3, 0x30])
TTN_NWKSKEY = bytearray([0x76, 0xAF, 0x78, 0xA0, 0x01, 0xF8, 0x01, 0x77,
                         0x6B, 0x11, 0x9E, 0xB3, 0xC3, 0x03, 0xA8, 0xB6])
TTN_APPSKEY = bytearray([0x1A, 0xDB, 0xD5, 0xDB, 0x46, 0xE7, 0x7F, 0x3F,
                         0x47, 0xE9, 0x07, 0x19, 0x84, 0x52, 0x71, 0x35])
LORA_REGION = "EU433"       # Ra-02 / SX1278 is a 433 MHz part

# Buzzer sounds when ANY of these is reached
TILT_CRITICAL_DEG = 8.0
VIBRATION_CRITICAL_DPS = 50.0     # peak gyro rate over the sampling window
HUMIDITY_CRITICAL_PCT = 80
RAIN_CRITICAL_PCT = 80
CRITICAL_HYSTERESIS_DEG = 1.0     # tilt must fall this far below before the buzzer stops

# Calibrate against YOUR sensors: print raw readings with the sensor dry,
# then wet, and put those numbers here.
SOIL_DRY_RAW, SOIL_WET_RAW = 4095, 1500
RAIN_DRY_RAW, RAIN_WET_RAW = 4095, 1000

PIN_BUZZER = 25
PIN_HUMIDITY_ADC = 34
PIN_RAIN_ADC = 35
I2C_SCL = 22
I2C_SDA = 21
# Set to e.g. 32 and wire the soil probe's VCC to that pin to power the
# probe only while reading (resistive probes corrode if always powered).
PIN_SOIL_POWER = None

# ----------------------------------------------------------------------
# LOCAL HARDWARE
# ----------------------------------------------------------------------

buzzer = Pin(PIN_BUZZER, Pin.OUT)
buzzer.off()

i2c = I2C(0, scl=Pin(I2C_SCL), sda=Pin(I2C_SDA), freq=400000)

humidity_adc = ADC(Pin(PIN_HUMIDITY_ADC))
humidity_adc.atten(ADC.ATTN_11DB)
rain_adc = ADC(Pin(PIN_RAIN_ADC))
rain_adc.atten(ADC.ATTN_11DB)

soil_power = None
if PIN_SOIL_POWER is not None:
    soil_power = Pin(PIN_SOIL_POWER, Pin.OUT)
    soil_power.off()


def read_adc_avg(adc, samples=8):
    """Average several ADC reads; the ESP32 ADC is noisy."""
    total = 0
    for _ in range(samples):
        total += adc.read()
        time.sleep_ms(2)
    return total // samples


def to_pct(raw, dry_raw, wet_raw):
    pct = (dry_raw - raw) * 100 // (dry_raw - wet_raw)
    return max(0, min(100, pct))


def read_humidity_pct():
    if soil_power is not None:
        soil_power.on()
        time.sleep_ms(100)
    raw = read_adc_avg(humidity_adc)
    if soil_power is not None:
        soil_power.off()
    return to_pct(raw, SOIL_DRY_RAW, SOIL_WET_RAW)


def read_rain_pct():
    return to_pct(read_adc_avg(rain_adc), RAIN_DRY_RAW, RAIN_WET_RAW)


# ----------------------------------------------------------------------
# MPU6050: tilt (accelerometer) + vibration (gyroscope)
# ----------------------------------------------------------------------

MPU_ADDR = 0x68


class MPU6050:
    def __init__(self, i2c, addr=MPU_ADDR):
        self.i2c = i2c
        self.addr = addr
        self.i2c.writeto_mem(self.addr, 0x6B, b'\x00')  # wake up
        time.sleep_ms(50)

    def _read_word(self, reg):
        data = self.i2c.readfrom_mem(self.addr, reg, 2)
        val = (data[0] << 8) | data[1]
        if val >= 0x8000:
            val -= 0x10000
        return val

    def read_accel(self):
        ax = self._read_word(0x3B) / 16384.0
        ay = self._read_word(0x3D) / 16384.0
        az = self._read_word(0x3F) / 16384.0
        return ax, ay, az

    def read_gyro(self):
        # +-250 deg/s range -> 131 LSB per deg/s
        gx = self._read_word(0x43) / 131.0
        gy = self._read_word(0x45) / 131.0
        gz = self._read_word(0x47) / 131.0
        return gx, gy, gz


def compute_pitch_roll(ax, ay, az):
    pitch = math.atan2(ax, math.sqrt(ay * ay + az * az)) * 180.0 / math.pi
    roll = math.atan2(ay, math.sqrt(ax * ax + az * az)) * 180.0 / math.pi
    return pitch, roll


def compute_vibration_dps(gx, gy, gz):
    return math.sqrt(gx * gx + gy * gy + gz * gz)


mpu = None
try:
    mpu = MPU6050(i2c)
except Exception as e:
    print("MPU6050 init failed (check wiring, run i2c.scan()):", e)


def sample_motion(duration_ms=1000, interval_ms=50):
    """Sample for a short window. Returns (avg pitch, avg roll, PEAK
    vibration in deg/s). A single instant reading would miss shaking
    that happens between the 5-minute polls, so the peak is used."""
    n = 0
    sum_pitch = 0.0
    sum_roll = 0.0
    peak = 0.0
    end = time.ticks_add(time.ticks_ms(), duration_ms)
    while True:
        ax, ay, az = mpu.read_accel()
        gx, gy, gz = mpu.read_gyro()
        pitch, roll = compute_pitch_roll(ax, ay, az)
        sum_pitch += pitch
        sum_roll += roll
        n += 1
        v = compute_vibration_dps(gx, gy, gz)
        if v > peak:
            peak = v
        if time.ticks_diff(end, time.ticks_ms()) <= 0:
            break
        time.sleep_ms(interval_ms)
    return sum_pitch / n, sum_roll / n, peak


# Baseline orientation, measured once at boot: mount the unit in its
# final position, THEN power it on.
base_pitch, base_roll = 0.0, 0.0
if mpu:
    try:
        base_pitch, base_roll, _ = sample_motion(500, 25)
        print("Baseline pitch={:.2f} roll={:.2f}".format(base_pitch, base_roll))
    except Exception as e:
        print("MPU6050 baseline failed:", e)

# ----------------------------------------------------------------------
# LoRaWAN (TTN, ABP) via uLoRa: fallback path
# ----------------------------------------------------------------------

lora = None
lora_frame_counter = 0

try:
    from ulora import uLoRa, TTN

    ttn_config = TTN(
        dev_address=TTN_DEVADDR,
        net_key=TTN_NWKSKEY,
        app_key=TTN_APPSKEY,
        country=LORA_REGION,
    )
    # uLoRa takes raw GPIO numbers and builds its own SPI/Pin objects.
    lora = uLoRa(
        cs=5, sck=18, mosi=23, miso=19, irq=2, rst=14,
        ttn_config=ttn_config,
        datarate="SF7BW125",
        fport=1,
    )
    print("LoRaWAN (uLoRa/ABP, {}) initialized".format(LORA_REGION))
except Exception as e:
    print("LoRaWAN disabled:", e)
    lora = None


def send_via_lorawan(payload_dict):
    """6-byte unconfirmed uplink: tilt*100 (uint16), vibration, soil
    moisture, rain, critical flag. Matches the TTN payload formatter."""
    global lora_frame_counter
    if not lora:
        return False
    try:
        tilt_scaled = int(abs(payload_dict["tilt_deg"]) * 100) & 0xFFFF
        frame = bytearray([
            (tilt_scaled >> 8) & 0xFF,
            tilt_scaled & 0xFF,
            min(255, int(payload_dict["vibration_dps"])) & 0xFF,
            int(payload_dict["humidity_pct"]) & 0xFF,
            int(payload_dict["rain_pct"]) & 0xFF,
            1 if payload_dict["critical"] else 0,
        ])
        # uLoRa does not count frames itself; we pass the counter in.
        lora.send_data(frame, len(frame), lora_frame_counter)
        hex_str = ' '.join('{:02X}'.format(b) for b in frame)
        print("LoRaWAN uplink sent (fcnt={}): {}".format(lora_frame_counter, hex_str))
        lora_frame_counter += 1
        return True
    except Exception as e:
        print("LoRaWAN send failed:", e)
        return False


# ----------------------------------------------------------------------
# WiFi + MQTT (HiveMQ): primary path
# ----------------------------------------------------------------------

def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if wlan.isconnected():
        return wlan
    wlan.connect(WIFI_SSID, WIFI_PASS)
    start = time.ticks_ms()
    while not wlan.isconnected():
        if time.ticks_diff(time.ticks_ms(), start) > WIFI_CONNECT_TIMEOUT_S * 1000:
            print("WiFi connect timed out")
            return None
        time.sleep_ms(200)
    print("WiFi connected:", wlan.ifconfig())
    return wlan


def send_via_mqtt(payload_dict):
    if MQTTClient is None:
        print("MQTT library missing (need umqtt/simple.py on the board)")
        return False
    if not connect_wifi():
        return False
    client = MQTTClient(MQTT_CLIENT_ID, MQTT_BROKER, port=MQTT_PORT, keepalive=30)
    try:
        client.connect()
        payload = ujson.dumps(payload_dict).encode()
        client.publish(MQTT_TOPIC, payload, qos=0)
        client.disconnect()
        print("MQTT publish OK:", payload)
        return True
    except Exception as e:
        print("MQTT publish failed:", e)
        try:
            client.disconnect()
        except Exception:
            pass
        return False


# ----------------------------------------------------------------------
# Critical check (hysteresis on tilt so the buzzer doesn't chatter)
# ----------------------------------------------------------------------

buzzer_on = False


def evaluate_critical(tilt_deg, vibration_dps, humidity_pct, rain_pct):
    global buzzer_on
    tilt_deg = abs(tilt_deg)
    tilt_limit = TILT_CRITICAL_DEG
    if buzzer_on:
        tilt_limit = TILT_CRITICAL_DEG - CRITICAL_HYSTERESIS_DEG
    buzzer_on = (
        tilt_deg >= tilt_limit
        or vibration_dps >= VIBRATION_CRITICAL_DPS
        or humidity_pct >= HUMIDITY_CRITICAL_PCT
        or rain_pct >= RAIN_CRITICAL_PCT
    )
    return buzzer_on


# ----------------------------------------------------------------------
# MAIN LOOP
# ----------------------------------------------------------------------

def main():
    print("Landslide node starting. Polling every {}s.".format(POLL_INTERVAL_S))
    while True:
        tilt_deg = 0.0
        vibration_dps = 0.0
        if mpu:
            try:
                pitch, roll, vibration_dps = sample_motion()
                tilt_deg = max(abs(pitch - base_pitch), abs(roll - base_roll))
            except Exception as e:
                print("MPU6050 read failed:", e)

        humidity_pct = read_humidity_pct()
        rain_pct = read_rain_pct()

        # Local alarm: runs every cycle, independent of any network path
        is_critical = evaluate_critical(tilt_deg, vibration_dps, humidity_pct, rain_pct)
        buzzer.value(1 if is_critical else 0)

        payload = {
            "tilt_deg": round(tilt_deg, 2),
            "vibration_dps": round(vibration_dps, 2),
            "humidity_pct": humidity_pct,
            "rain_pct": rain_pct,
            "critical": is_critical,
            "ts": time.time(),
        }
        print("Reading:", payload)

        # WiFi + MQTT first, LoRaWAN if that fails
        if not send_via_mqtt(payload):
            print("WiFi/MQTT unavailable, falling back to LoRaWAN")
            if not send_via_lorawan(payload):
                print("Both telemetry paths failed this cycle "
                      "(local buzzer still active if critical)")

        time.sleep(POLL_INTERVAL_S)


if __name__ == "__main__":
    main()
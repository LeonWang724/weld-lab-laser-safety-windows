/*
  Weld Lab Laser Safety manual status reporter — Arduino UNO R4 Minima
  Buttons: D2 = 532 ON, D3 = 532 OFF, D4 = 1064 ON, D5 = 1064 OFF.
  Connect each normally-open momentary button between its pin and GND.
  Internal pull-ups are enabled. No connection to any laser is required.
  This reports operator input only; it never controls or measures a laser.
  Both channels start UNKNOWN after every reset. Press ON/OFF again to
  reconfirm a report (the webpage expires reports after five minutes).
  USB serial: 115200 baud. Close Serial Monitor before connecting the page.
*/

#include <string.h>

const uint8_t buttonPins[] = {2, 3, 4, 5};
const uint16_t wavelengths[] = {532, 1064};
int8_t states[] = {-1, -1};
unsigned long changedAt[] = {0, 0};
bool stableLevel[] = {HIGH, HIGH, HIGH, HIGH};
bool lastReading[] = {HIGH, HIGH, HIGH, HIGH};
unsigned long debounceAt[] = {0, 0, 0, 0};
unsigned long lastFrame = 0;
char commandBuffer[48];
uint8_t commandLength = 0;
bool droppingCommand = false;

void sendFrame() {
  Serial.print("{\"v\":1,\"uptime\":"); Serial.print(millis());
  Serial.print(",\"lasers\":[");
  for (uint8_t i = 0; i < 2; i++) {
    if (i) Serial.print(',');
    Serial.print("{\"nm\":"); Serial.print(wavelengths[i]);
    Serial.print(",\"state\":"); Serial.print((int)states[i]);
    Serial.print(",\"changed\":"); Serial.print(changedAt[i]);
    Serial.print('}');
  }
  Serial.println("]}");
  lastFrame = millis();
}

void reportState(uint8_t index, int8_t state) {
  states[index] = state;
  changedAt[index] = millis();
  sendFrame();
}

void processCommand() {
  if (!strcmp(commandBuffer, "GET")) { sendFrame(); return; }
  if (!strcmp(commandBuffer, "RESET")) {
    states[0] = states[1] = -1;
    changedAt[0] = changedAt[1] = millis();
    sendFrame(); return;
  }
  if (!strcmp(commandBuffer, "SET 532 ON")) reportState(0, 1);
  else if (!strcmp(commandBuffer, "SET 532 OFF")) reportState(0, 0);
  else if (!strcmp(commandBuffer, "SET 1064 ON")) reportState(1, 1);
  else if (!strcmp(commandBuffer, "SET 1064 OFF")) reportState(1, 0);
}

void setup() {
  Serial.begin(115200);
  for (uint8_t i = 0; i < 4; i++) pinMode(buttonPins[i], INPUT_PULLUP);
}

void loop() {
  const unsigned long now = millis();
  for (uint8_t i = 0; i < 2; i++) {
    if (states[i] != -1 && (unsigned long)(now - changedAt[i]) > 300000UL) {
      states[i] = -1;
      changedAt[i] = now;
      sendFrame();
    }
  }
  for (uint8_t i = 0; i < 4; i++) {
    const bool reading = digitalRead(buttonPins[i]);
    if (reading != lastReading[i]) debounceAt[i] = now;
    if ((unsigned long)(now - debounceAt[i]) >= 35 && reading != stableLevel[i]) {
      stableLevel[i] = reading;
      if (reading == LOW) reportState(i / 2, (i % 2 == 0) ? 1 : 0);
    }
    lastReading[i] = reading;
  }
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      if (!droppingCommand) { commandBuffer[commandLength] = '\0'; processCommand(); }
      commandLength = 0; droppingCommand = false;
    } else if (c != '\r' && !droppingCommand) {
      if (commandLength < sizeof(commandBuffer) - 1) commandBuffer[commandLength++] = c;
      else { commandLength = 0; droppingCommand = true; }
    }
  }
  if ((unsigned long)(now - lastFrame) >= 1000) sendFrame();
}

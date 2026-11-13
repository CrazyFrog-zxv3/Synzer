# SYNZER

DSP Core Lab experimental build 0.2.0.

The browser demo is published at the repository root. The complete Android/local source package is available in `releases/SYNZER-LOCAL-0.2.0-ANDROID.zip`.

This build includes a Web Audio AudioWorklet engine with sine, PolyBLEP saw and PolyBLEP square oscillators, ADSR envelope, multitouch keyboard, and automated Node.js tests.

**Validation boundary:** automated tests and a local Node microbenchmark do not establish real-device audio output, Android latency, or POCO compatibility. Those require physical-device testing.

See `docs/` in the source archive for architecture, Android/Termux instructions, status, and validation details.

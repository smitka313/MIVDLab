# MIVD Telemetry Lab

A browser-based telemetry lab for student RC vehicle engineering. A BBC micro:bit V2 mounted on the car records acceleration during a test run; students import the recording here to analyze the run, compare vehicle setups and build an evidence-based engineering report.

Everything runs locally in the browser. There is no server, no account and no install, and recordings never leave the computer.

## What's in this repository

| File | Purpose |
| --- | --- |
| `index.html` | The whole app: one self-contained page |
| `microbit-RC-Telemetry-Logger.hex` | micro:bit V2 logger program (also downloadable from the app header) |
| `MIVD_Simulated_Run_1_Stock.csv` | Simulated practice run: stock setup |
| `MIVD_Simulated_Run_2_Modified.csv` | Simulated practice run: modified setup |
| `square-one-logo-transparent.png` | Logo |

## Getting started

Open `index.html` in a current Chrome, Edge or Firefox browser (Chromebooks work). To try it without hardware, click **Try example data**.

### Recording a run

1. Copy `microbit-RC-Telemetry-Logger.hex` onto the micro:bit's **MICROBIT** drive.
2. Hold **A** while powering on or resetting; the display shows **CAR**. Mount the board flat, LEDs up, top edge toward the front of the car.
3. Press **A** for the direction check, then push the car straight forward by hand.
4. With the car still and level at the start, press **A** again to calibrate and start recording. Drive the test, stop, and press **B** to end it.

A second micro:bit running the same program is optional and only shows live values on a computer.

The in-app **Set Up micro:bit** guide and **Test-day checklist** cover mounting, status icons (MOVE, TILT, ERR, SIDE) and troubleshooting in full.

### Importing data

Plug the car's micro:bit into the computer and open the **MICROBIT** drive, then either:

- drag **MY_DATA.HTM** (or a CSV exported from it) onto the app, or
- click **Import CSV files** and pick the file.

Required columns are `time_ms`, `ax_mg`, `ay_mg` and `az_mg`. When present, the app also uses `run`, `forward_ms2`, `lateral_ms2`, `pitch_deg`, `roll_deg`, `vib_rms_mg`, `peak_g` and `speed_est_mph`. One file can hold several runs.

## Workflow

1. **Collect Data**: import and name runs (for example *Control: stock tires* and *Change: grippier tires*), and save or restore a backup file.
2. **Analyze**: scoreboard, a plain-language summary of the run, lap times, graphs (forward and cornering acceleration, speed index, tilt, g-force and vibration, G–G diagram), automatically identified events and the raw data. Use the **Jump to** links to move around.
3. **Test & Compare**: an automatic "Did the change help?" verdict that ignores differences smaller than measurement noise, repeated-trial comparison, detailed competition test records and a spur/pinion gear ratio calculator.
4. **Report**: an evidence board of saved graphs, a claim-evidence-reasoning (CER) engineering decision journal and printable reports.

The searchable **User Manual** (in the header) explains each section.

## Saving work

Work is autosaved in the browser on the device being used. To move to another computer, or before clearing browser data, use **Collect Data → Save or move your work** to download a backup file, then restore it on the other device.

## Notes

- The speed index is an estimate calculated from acceleration, not a measured speed. Use stopwatch and lap times as the main evidence; the app includes an optional tape-measure check of speed index accuracy.
- Hosting is optional: the page can be opened straight from a downloaded copy, or served from any static host such as GitHub Pages.

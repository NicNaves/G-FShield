# Ten-day campaign analysis

- Valid independent runs: 216 (27 arms x 8 seeds).
- Invalid attempts excluded: 12; every missing seed was retried successfully.
- Validation-selected arm: `RF-VND-IWSSR` (`distributed-relieff-vnd-iwssr`).
- Selected arm median test macro-F1: 0.944750 (IQR 0.944100-0.944867).
- All-features median test macro-F1: 0.937809.
- Holm-adjusted exploratory paired comparisons below 0.05: 0.
- The common final metric is Weka J48 macro-F1 on the untouched test split.
- Audit of image-source commit `b38eff3ed9c1e6b6f4c25ecfb574377e5fde88b5` confirmed that G-FShield's active internal best-so-far score is multiclass macro-F1. The legacy binary routine containing `normalClass=0` was disabled. The campaign still does not support a valid architectural time-to-target comparison because the monolith CSV files record per-candidate evaluation durations rather than a cumulative monotonic candidate timeline.

## Configuration summary

| Arm | Median validation F1 | Median test F1 | Test IQR | Median |S| | Median reduction | Unique final subsets |
|---|---:|---:|---:|---:|---:|---:|
| RF-VND-IWSSR | 0.9441 | 0.9448 | 0.9441-0.9449 | 11.0 | 78.4% | 8 |
| RF-RVND-IWSSR | 0.9430 | 0.9438 | 0.9429-0.9443 | 13.0 | 74.5% | 8 |
| RF-RVND-BF | 0.9429 | 0.9435 | 0.9422-0.9443 | 11.0 | 78.4% | 8 |
| IG-VND-IWSS | 0.9439 | 0.9434 | 0.9429-0.9445 | 14.0 | 72.5% | 8 |
| IG-RVND-BF | 0.9435 | 0.9433 | 0.9426-0.9441 | 12.5 | 75.5% | 8 |
| RF-RVND-IWSS | 0.9423 | 0.9432 | 0.9423-0.9452 | 12.0 | 76.5% | 8 |
| IG-RVND-IWSS | 0.9434 | 0.9429 | 0.9422-0.9434 | 14.0 | 72.5% | 8 |
| RF-VND-IWSS | 0.9428 | 0.9426 | 0.9420-0.9440 | 12.5 | 75.5% | 8 |
| SU-VND-IWSSR | 0.9423 | 0.9422 | 0.9420-0.9422 | 12.5 | 75.5% | 8 |
| GR-VND-IWSS | 0.9414 | 0.9420 | 0.9418-0.9431 | 16.0 | 68.6% | 8 |
| SU-VND-IWSS | 0.9415 | 0.9419 | 0.9411-0.9426 | 17.0 | 66.7% | 8 |
| GR-RVND-BF | 0.9410 | 0.9419 | 0.9415-0.9422 | 15.5 | 69.6% | 8 |
| GR-RVND-IWSSR | 0.9416 | 0.9418 | 0.9408-0.9434 | 12.5 | 75.5% | 8 |
| IG-RVND-IWSSR | 0.9425 | 0.9417 | 0.9409-0.9430 | 14.0 | 72.5% | 8 |
| GR-RVND-IWSS | 0.9411 | 0.9417 | 0.9410-0.9422 | 12.0 | 76.5% | 8 |
| GR-VND-IWSSR | 0.9429 | 0.9416 | 0.9394-0.9428 | 12.0 | 76.5% | 8 |
| SU-RVND-IWSS | 0.9415 | 0.9414 | 0.9402-0.9420 | 14.5 | 71.6% | 8 |
| SU-RVND-IWSSR | 0.9409 | 0.9413 | 0.9405-0.9416 | 14.5 | 71.6% | 8 |
| IG-VND-IWSSR | 0.9417 | 0.9410 | 0.9377-0.9446 | 11.5 | 77.5% | 8 |
| SU-RVND-BF | 0.9405 | 0.9406 | 0.9403-0.9415 | 16.0 | 68.6% | 8 |
| M1-GR-BF | 0.9394 | 0.9397 | 0.9345-0.9397 | 5.0 | 90.2% | 3 |
| ALL-51 | 0.9368 | 0.9378 | 0.9378-0.9378 | 51.0 | 0.0% | 1 |
| RF-VND-BF | 0.8998 | 0.8999 | 0.8826-0.9129 | 5.0 | 90.2% | 8 |
| GR-VND-BF | 0.8801 | 0.8824 | 0.8477-0.8951 | 5.0 | 90.2% | 8 |
| SU-VND-BF | 0.8799 | 0.8794 | 0.8620-0.9085 | 5.0 | 90.2% | 8 |
| IG-VND-BF | 0.8663 | 0.8671 | 0.8492-0.8935 | 5.0 | 90.2% | 8 |
| M2-GR-IWSS | 0.8403 | 0.8411 | 0.6034-0.8696 | 5.0 | 90.2% | 8 |
